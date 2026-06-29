namespace Inkora.PrintBridge.Services;

public sealed class BridgeLogService
{
    private readonly string _logFilePath;

    public BridgeLogService()
    {
        var preferredRoot = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "INKORA",
            "PrintBridge",
            "logs");

        var root = TryCreateDirectory(preferredRoot)
            ?? TryCreateDirectory(Path.Combine(AppContext.BaseDirectory, "diagnostic-logs"))
            ?? AppContext.BaseDirectory;

        _logFilePath = Path.Combine(root, "bridge-diagnostic.log");
    }

    public string LogFilePath => _logFilePath;

    public void Info(string message)
    {
        Write("INFO", message);
    }

    public void Error(string message)
    {
        Write("ERROR", message);
    }

    private void Write(string level, string message)
    {
        var line = $"{DateTimeOffset.Now:yyyy-MM-dd HH:mm:ss zzz} [{level}] {message}";
        try
        {
            File.AppendAllText(_logFilePath, line + Environment.NewLine);
        }
        catch
        {
            // Logging must never block printer diagnostics.
        }
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
