using System.Security.Cryptography;

namespace Inkora.PrintBridge.Services;

public sealed class BridgeConfigService
{
    private readonly string _configRoot;

    public BridgeConfigService()
    {
        var preferredRoot = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "INKORA",
            "PrintBridge");

        _configRoot = TryCreateDirectory(preferredRoot)
            ?? TryCreateDirectory(Path.Combine(AppContext.BaseDirectory, "local-config"))
            ?? AppContext.BaseDirectory;
    }

    public string ConfigRoot => _configRoot;

    public string TokenFilePath => Path.Combine(_configRoot, "bridge-token.txt");

    public string GetOrCreatePairingToken()
    {
        try
        {
            if (File.Exists(TokenFilePath))
            {
                var existing = File.ReadAllText(TokenFilePath).Trim();
                if (existing.Length >= 32)
                {
                    return existing;
                }
            }

            var token = GenerateToken();
            File.WriteAllText(TokenFilePath, token);
            return token;
        }
        catch
        {
            return GenerateToken();
        }
    }

    private static string GenerateToken()
    {
        var bytes = RandomNumberGenerator.GetBytes(32);
        return Convert.ToBase64String(bytes)
            .TrimEnd('=')
            .Replace('+', '-')
            .Replace('/', '_');
    }

    private static string? TryCreateDirectory(string path)
    {
        try
        {
            Directory.CreateDirectory(path);
            return path;
        }
        catch
        {
            return null;
        }
    }
}
