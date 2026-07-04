using System.Diagnostics;
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
        // Una instancia vieja/colgada (ej. arrancada por Windows al iniciar sesion,
        // o una version desactualizada) no debe bloquear la instancia nueva: se la
        // mata y esta toma el lugar. Asi el usuario nunca tiene que adivinar cual
        // proceso esta realmente atendiendo pedidos.
        KillOtherInstancesAndWaitForPort();

        RegisterUriScheme();

        Application.SetHighDpiMode(HighDpiMode.SystemAware);
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Application.Run(new MainForm());
    }

    private static void KillOtherInstancesAndWaitForPort()
    {
        try
        {
            var current = Process.GetCurrentProcess();
            foreach (var proc in Process.GetProcessesByName(current.ProcessName))
            {
                if (proc.Id == current.Id) continue;
                try
                {
                    proc.Kill();
                    proc.WaitForExit(5000);
                }
                catch
                {
                    // Best-effort: si no se puede matar, igual seguimos e intentamos levantar.
                }
            }
        }
        catch
        {
            // Best-effort
        }

        var deadline = Environment.TickCount64 + 5000;
        while (IsPortInUse(BridgePort) && Environment.TickCount64 < deadline)
        {
            Thread.Sleep(200);
        }
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
