using System.Text.Json;
using Inkora.PrintBridge.Models;

namespace Inkora.PrintBridge.Services;

public sealed class DevModeProfileService
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = true
    };

    private sealed class StoredProfile
    {
        public string DataBase64 { get; set; } = "";
        public int SizeBytes { get; set; }
        public DateTimeOffset SavedAt { get; set; } = DateTimeOffset.Now;
    }

    private readonly BridgeConfigService _configService;
    private readonly DevModeService _devModeService;
    private readonly BridgeLogService _logService;
    private readonly object _lock = new();
    private Dictionary<string, Dictionary<string, StoredProfile>> _store =
        new(StringComparer.OrdinalIgnoreCase);

    public DevModeProfileService(BridgeConfigService configService, DevModeService devModeService, BridgeLogService logService)
    {
        _configService = configService;
        _devModeService = devModeService;
        _logService = logService;
        Load();
    }

    private string FilePath => Path.Combine(_configService.ConfigRoot, "devmode-profiles.json");

    public IReadOnlyList<DevModeProfileInfo> GetProfiles(string printerName)
    {
        lock (_lock)
        {
            if (string.IsNullOrWhiteSpace(printerName) || !_store.TryGetValue(printerName, out var profiles))
            {
                return [];
            }

            return profiles
                .Select(kv => new DevModeProfileInfo
                {
                    Name = kv.Key,
                    PrinterName = printerName,
                    SizeBytes = kv.Value.SizeBytes,
                    SavedAt = kv.Value.SavedAt
                })
                .OrderBy(p => p.Name, StringComparer.OrdinalIgnoreCase)
                .ToList();
        }
    }

    public DevModeProfileInfo SaveCurrentAsProfile(string printerName, string profileName)
    {
        if (string.IsNullOrWhiteSpace(printerName)) throw new ArgumentException("Falta impresora.");
        if (string.IsNullOrWhiteSpace(profileName)) throw new ArgumentException("Falta nombre de perfil.");

        var bytes = _devModeService.ReadDefaultDevModeBytes(printerName);
        var stored = new StoredProfile
        {
            DataBase64 = Convert.ToBase64String(bytes),
            SizeBytes = bytes.Length,
            SavedAt = DateTimeOffset.Now
        };

        lock (_lock)
        {
            if (!_store.TryGetValue(printerName, out var profiles))
            {
                profiles = new Dictionary<string, StoredProfile>(StringComparer.OrdinalIgnoreCase);
                _store[printerName] = profiles;
            }

            profiles[profileName] = stored;
            Save();
        }

        _logService.Info($"Perfil DEVMODE guardado: {printerName} / {profileName} ({bytes.Length} bytes).");
        return new DevModeProfileInfo { Name = profileName, PrinterName = printerName, SizeBytes = stored.SizeBytes, SavedAt = stored.SavedAt };
    }

    public void ApplyProfile(string printerName, string profileName)
    {
        StoredProfile? stored;
        lock (_lock)
        {
            if (string.IsNullOrWhiteSpace(printerName)
                || !_store.TryGetValue(printerName, out var profiles)
                || !profiles.TryGetValue(profileName, out stored))
            {
                throw new InvalidOperationException($"Perfil '{profileName}' no encontrado para {printerName}.");
            }
        }

        var bytes = Convert.FromBase64String(stored.DataBase64);
        _devModeService.ApplyDevModeBytes(printerName, bytes);
        _logService.Info($"Perfil DEVMODE aplicado: {printerName} / {profileName} ({bytes.Length} bytes).");
    }

    public bool DeleteProfile(string printerName, string profileName)
    {
        lock (_lock)
        {
            if (string.IsNullOrWhiteSpace(printerName)
                || !_store.TryGetValue(printerName, out var profiles)
                || !profiles.Remove(profileName))
            {
                return false;
            }

            Save();
        }

        _logService.Info($"Perfil DEVMODE eliminado: {printerName} / {profileName}.");
        return true;
    }

    private void Load()
    {
        try
        {
            if (!File.Exists(FilePath))
            {
                return;
            }

            var data = JsonSerializer.Deserialize<Dictionary<string, Dictionary<string, StoredProfile>>>(
                File.ReadAllText(FilePath), JsonOptions);

            if (data is not null)
            {
                _store = new Dictionary<string, Dictionary<string, StoredProfile>>(data, StringComparer.OrdinalIgnoreCase);
            }
        }
        catch (Exception exception)
        {
            _logService.Error($"No se pudieron cargar perfiles DEVMODE: {exception}");
            _store = new Dictionary<string, Dictionary<string, StoredProfile>>(StringComparer.OrdinalIgnoreCase);
        }
    }

    private void Save()
    {
        File.WriteAllText(FilePath, JsonSerializer.Serialize(_store, JsonOptions));
    }
}
