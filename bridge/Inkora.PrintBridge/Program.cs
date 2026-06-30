using System.Net.Sockets;
using System.Windows.Forms;
using Microsoft.Win32;

namespace Inkora.PrintBridge;

internal static class Program
{
    private const int BridgePort = 17389;
    private const string UriScheme = "inkora-bridge";

    [STAThread]
    private static void Main()
    {
        // Exit silently if a Bridge instance is already listening
        if (IsPortInUse(BridgePort)) return;

        RegisterUriScheme();

        Application.SetHighDpiMode(HighDpiMode.SystemAware);
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Application.Run(new MainForm());
    }

    private static bool IsPortInUse(int port)
    {
        try
        {
            using var client = new TcpClient();
            client.Connect(System.Net.IPAddress.Loopback, port);
            return true;
        }
        catch
        {
            return false;
        }
    }

    private static void RegisterUriScheme()
    {
        try
        {
            var exePath = Environment.ProcessPath
                ?? System.IO.Path.Combine(AppContext.BaseDirectory, "Inkora.PrintBridge.exe");

            using var root = Registry.CurrentUser.CreateSubKey($@"Software\Classes\{UriScheme}");
            root.SetValue("", "URL:INKORA Bridge Protocol");
            root.SetValue("URL Protocol", "");

            using var icon = root.CreateSubKey("DefaultIcon");
            icon.SetValue("", $"{exePath},0");

            using var command = root.CreateSubKey(@"shell\open\command");
            command.SetValue("", $"\"{exePath}\" \"%1\"");
        }
        catch
        {
            // Non-fatal: URI scheme registration is best-effort
        }
    }
}
