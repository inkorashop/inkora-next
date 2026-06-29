using System.Drawing.Printing;
using System.Runtime.InteropServices;
using Inkora.PrintBridge.Models;

namespace Inkora.PrintBridge.Services;

public sealed class PrinterService
{
    private const string TargetPrinterNeedle = "L8050";

    public IReadOnlyList<PrinterInfo> GetInstalledPrinters()
    {
        var defaultPrinterName = GetDefaultPrinterName();
        var printers = new List<PrinterInfo>();

        foreach (string name in PrinterSettings.InstalledPrinters)
        {
            var spooler = TryGetSpoolerInfo(name);
            printers.Add(new PrinterInfo
            {
                Name = name,
                IsDefault = string.Equals(name, defaultPrinterName, StringComparison.OrdinalIgnoreCase),
                IsTargetL8050 = IsTargetPrinter(name),
                StatusText = spooler.StatusText,
                DriverName = spooler.DriverName,
                PortName = spooler.PortName,
                StatusCode = spooler.StatusCode,
                Attributes = spooler.Attributes,
                JobCount = spooler.JobCount,
                Error = spooler.Error
            });
        }

        return printers
            .OrderByDescending(printer => printer.IsTargetL8050)
            .ThenByDescending(printer => printer.IsDefault)
            .ThenBy(printer => printer.Name, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    public string GetDefaultPrinterName()
    {
        try
        {
            var settings = new PrinterSettings();
            return settings.IsValid ? settings.PrinterName : "";
        }
        catch
        {
            return "";
        }
    }

    private static bool IsTargetPrinter(string printerName)
    {
        return printerName.Contains(TargetPrinterNeedle, StringComparison.OrdinalIgnoreCase);
    }

    private static SpoolerSnapshot TryGetSpoolerInfo(string printerName)
    {
        if (!WinSpoolApi.OpenPrinter(printerName, out var printerHandle, IntPtr.Zero))
        {
            return SpoolerSnapshot.FromError($"OpenPrinter fallo. Win32={Marshal.GetLastWin32Error()}");
        }

        try
        {
            _ = WinSpoolApi.GetPrinter(printerHandle, 2, IntPtr.Zero, 0, out var bytesNeeded);
            if (bytesNeeded <= 0)
            {
                return SpoolerSnapshot.FromError($"GetPrinter no informo buffer. Win32={Marshal.GetLastWin32Error()}");
            }

            var buffer = Marshal.AllocHGlobal(bytesNeeded);
            try
            {
                if (!WinSpoolApi.GetPrinter(printerHandle, 2, buffer, bytesNeeded, out _))
                {
                    return SpoolerSnapshot.FromError($"GetPrinter fallo. Win32={Marshal.GetLastWin32Error()}");
                }

                var info = Marshal.PtrToStructure<WinSpoolApi.PrinterInfo2>(buffer);
                return new SpoolerSnapshot(
                    GetStatusText(info.Status),
                    info.Status,
                    info.Attributes,
                    info.Jobs,
                    info.DriverName ?? "",
                    info.PortName ?? "",
                    "");
            }
            finally
            {
                Marshal.FreeHGlobal(buffer);
            }
        }
        finally
        {
            WinSpoolApi.ClosePrinter(printerHandle);
        }
    }

    private static string GetStatusText(uint status)
    {
        if (status == 0)
        {
            return "Lista";
        }

        var flags = new List<string>();
        AddStatus(flags, status, 0x00000001, "Pausada");
        AddStatus(flags, status, 0x00000002, "Error");
        AddStatus(flags, status, 0x00000004, "Eliminando");
        AddStatus(flags, status, 0x00000008, "Atasco");
        AddStatus(flags, status, 0x00000010, "Sin papel");
        AddStatus(flags, status, 0x00000020, "Manual");
        AddStatus(flags, status, 0x00000040, "Problema papel");
        AddStatus(flags, status, 0x00000080, "Offline");
        AddStatus(flags, status, 0x00000100, "IO activo");
        AddStatus(flags, status, 0x00000200, "Ocupada");
        AddStatus(flags, status, 0x00000400, "Imprimiendo");
        AddStatus(flags, status, 0x00000800, "Salida llena");
        AddStatus(flags, status, 0x00001000, "No disponible");
        AddStatus(flags, status, 0x00002000, "Esperando");
        AddStatus(flags, status, 0x00004000, "Procesando");
        AddStatus(flags, status, 0x00008000, "Inicializando");
        AddStatus(flags, status, 0x00010000, "Calentando");
        AddStatus(flags, status, 0x00020000, "Toner bajo");
        AddStatus(flags, status, 0x00040000, "Sin toner");
        AddStatus(flags, status, 0x00080000, "Pagina trabada");
        AddStatus(flags, status, 0x00100000, "Intervencion requerida");
        AddStatus(flags, status, 0x00200000, "Sin memoria");
        AddStatus(flags, status, 0x00400000, "Puerta abierta");
        AddStatus(flags, status, 0x00800000, "Servidor desconocido");
        AddStatus(flags, status, 0x01000000, "Ahorro energia");

        return flags.Count == 0 ? $"Estado 0x{status:X8}" : string.Join(", ", flags);
    }

    private static void AddStatus(ICollection<string> flags, uint status, uint mask, string label)
    {
        if ((status & mask) == mask)
        {
            flags.Add(label);
        }
    }

    private sealed record SpoolerSnapshot(
        string StatusText,
        uint StatusCode,
        uint Attributes,
        uint JobCount,
        string DriverName,
        string PortName,
        string Error)
    {
        public static SpoolerSnapshot FromError(string error)
        {
            return new SpoolerSnapshot("No disponible", 0, 0, 0, "", "", error);
        }
    }
}
