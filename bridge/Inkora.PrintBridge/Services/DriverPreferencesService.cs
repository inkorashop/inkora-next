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
    [DllImport("user32.dll")] private static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] private static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);
    [DllImport("kernel32.dll")] private static extern uint GetCurrentThreadId();

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

    // Abre la ventana nativa de Windows con la cola de una impresora puntual
    // (equivalente a doble-click en la impresora dentro de "Dispositivos e
    // impresoras"). Si no se especifica impresora, abre la carpeta general.
    public void OpenPrinterQueue(string? printerName)
    {
        Process? proc;
        if (!string.IsNullOrWhiteSpace(printerName))
        {
            var safeName = printerName.Replace("\"", "");
            proc = Process.Start(new ProcessStartInfo
            {
                FileName = "rundll32.exe",
                Arguments = $"printui.dll,PrintUIEntry /o /n \"{safeName}\"",
                UseShellExecute = false,
                CreateNoWindow = true,
            });
        }
        else
        {
            proc = Process.Start(new ProcessStartInfo
            {
                FileName = "explorer.exe",
                Arguments = "shell:PrintersFolder",
                UseShellExecute = true,
            });
        }

        if (proc != null)
        {
            Task.Run(async () =>
            {
                await Task.Delay(2000);
                BringProcessToFront(proc.Id);
            });
        }
    }

    // El Bridge corre en background (no es la ventana con foco), asi que un
    // SetForegroundWindow comun no alcanza: Windows bloquea el robo de foco
    // de procesos que no son "dueños" del foco actual (SPI_GETFOREGROUNDLOCKTIMEOUT).
    // El truco estandar es "pedir prestado" el foco adjuntando temporalmente
    // la cola de entrada de este hilo a la del hilo que SI tiene el foco
    // (normalmente el navegador desde donde se apreto el boton).
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

        if (handles.Count == 0) return;

        var currentThread = GetCurrentThreadId();
        var foregroundWindow = GetForegroundWindow();
        var foregroundThread = foregroundWindow != IntPtr.Zero
            ? GetWindowThreadProcessId(foregroundWindow, out _)
            : 0;
        var attached = foregroundThread != 0 && foregroundThread != currentThread
            && AttachThreadInput(currentThread, foregroundThread, true);

        try
        {
            foreach (var hwnd in handles)
            {
                ShowWindow(hwnd, 9); // SW_RESTORE
                SetForegroundWindow(hwnd);
                BringWindowToTop(hwnd);
            }
        }
        finally
        {
            if (attached) AttachThreadInput(currentThread, foregroundThread, false);
        }
    }
}
