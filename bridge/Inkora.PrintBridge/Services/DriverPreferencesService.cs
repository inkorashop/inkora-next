using System.Diagnostics;

namespace Inkora.PrintBridge.Services;

public sealed class DriverPreferencesService
{
    public void OpenPrinterPreferences(string printerName)
    {
        if (string.IsNullOrWhiteSpace(printerName))
        {
            throw new InvalidOperationException("No hay impresora seleccionada.");
        }

        var safeName = printerName.Replace("\"", "");
        var arguments = $"printui.dll,PrintUIEntry /e /n \"{safeName}\"";

        Process.Start(new ProcessStartInfo
        {
            FileName = "rundll32.exe",
            Arguments = arguments,
            UseShellExecute = false
        });
    }
}
