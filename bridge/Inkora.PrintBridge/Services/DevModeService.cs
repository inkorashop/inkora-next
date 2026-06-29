using System.Runtime.InteropServices;
using Inkora.PrintBridge.Models;

namespace Inkora.PrintBridge.Services;

public sealed class DevModeService
{
    public DevModeDiagnostic ReadDefaultDevMode(string printerName)
    {
        if (string.IsNullOrWhiteSpace(printerName))
        {
            return new DevModeDiagnostic { Error = "No hay impresora seleccionada." };
        }

        if (!WinSpoolApi.OpenPrinter(printerName, out var printerHandle, IntPtr.Zero))
        {
            return new DevModeDiagnostic
            {
                PrinterName = printerName,
                Error = $"OpenPrinter fallo. Win32={Marshal.GetLastWin32Error()}"
            };
        }

        try
        {
            var size = WinSpoolApi.DocumentProperties(
                IntPtr.Zero,
                printerHandle,
                printerName,
                IntPtr.Zero,
                IntPtr.Zero,
                0);

            if (size <= 0)
            {
                return new DevModeDiagnostic
                {
                    PrinterName = printerName,
                    QuerySize = size,
                    Error = $"DocumentProperties no devolvio tamano valido. Win32={Marshal.GetLastWin32Error()}"
                };
            }

            var buffer = Marshal.AllocHGlobal(size);
            try
            {
                var result = WinSpoolApi.DocumentProperties(
                    IntPtr.Zero,
                    printerHandle,
                    printerName,
                    buffer,
                    IntPtr.Zero,
                    WinSpoolApi.DmOutBuffer);

                if (result <= 0)
                {
                    return new DevModeDiagnostic
                    {
                        PrinterName = printerName,
                        QuerySize = size,
                        ResultCode = result,
                        Error = $"DocumentProperties fallo al leer DEVMODE. Win32={Marshal.GetLastWin32Error()}"
                    };
                }

                var header = Marshal.PtrToStructure<WinSpoolApi.DevModeHeader>(buffer);
                var bytes = new byte[Math.Min(size, 96)];
                Marshal.Copy(buffer, bytes, 0, bytes.Length);

                return new DevModeDiagnostic
                {
                    PrinterName = printerName,
                    QuerySize = size,
                    ResultCode = result,
                    DeviceName = header.DeviceName,
                    SpecVersion = header.SpecVersion,
                    DriverVersion = header.DriverVersion,
                    PublicSize = header.Size,
                    DriverExtra = header.DriverExtra,
                    FieldsHex = $"0x{header.Fields:X8}",
                    HeaderHex = Convert.ToHexString(bytes)
                };
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
}
