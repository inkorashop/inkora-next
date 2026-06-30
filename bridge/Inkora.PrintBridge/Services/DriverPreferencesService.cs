using System.Diagnostics;
using System.Runtime.InteropServices;

namespace Inkora.PrintBridge.Services;

public sealed class DriverPreferencesService
{
    [DllImport("user32.dll")] private static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] private static extern bool BringWindowToTop(IntPtr hWnd);
    [DllImport("user32.dll")] private static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

    private delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
    [DllImport("user32.dll")] private static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);

    public void OpenPrinterPreferences(string printerName)
    {
        if (string.IsNullOrWhiteSpace(printerName))
        {
            throw new InvalidOperationException("No hay impresora seleccionada.");
        }

        var safeName = printerName.Replace("\"", "");
        var arguments = $"printui.dll,PrintUIEntry /e /n \"{safeName}\"";

        var proc = Process.Start(new ProcessStartInfo
        {
            FileName = "rundll32.exe",
            Arguments = arguments,
            UseShellExecute = false
        });

        if (proc != null)
        {
            Task.Run(async () =>
            {
                await Task.Delay(2000);
                BringProcessToFront(proc.Id);
            });
        }
    }

    private static void BringProcessToFront(int pid)
    {
        var handles = new List<IntPtr>();
        EnumWindows((hwnd, _) =>
        {
            GetWindowThreadProcessId(hwnd, out uint windowPid);
            if ((int)windowPid == pid && IsWindowVisible(hwnd))
                handles.Add(hwnd);
            return true;
        }, IntPtr.Zero);

        foreach (var hwnd in handles)
        {
            ShowWindow(hwnd, 9); // SW_RESTORE
            SetForegroundWindow(hwnd);
            BringWindowToTop(hwnd);
        }
    }
}
