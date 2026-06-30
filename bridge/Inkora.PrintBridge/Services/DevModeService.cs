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

    public byte[] ReadDefaultDevModeBytes(string printerName)
    {
        if (string.IsNullOrWhiteSpace(printerName))
        {
            throw new ArgumentException("No hay impresora seleccionada.");
        }

        if (!WinSpoolApi.OpenPrinter(printerName, out var printerHandle, IntPtr.Zero))
        {
            throw new InvalidOperationException($"OpenPrinter fallo. Win32={Marshal.GetLastWin32Error()}");
        }

        try
        {
            var size = WinSpoolApi.DocumentProperties(IntPtr.Zero, printerHandle, printerName, IntPtr.Zero, IntPtr.Zero, 0);
            if (size <= 0)
            {
                throw new InvalidOperationException($"No se pudo determinar el tamano DEVMODE. Win32={Marshal.GetLastWin32Error()}");
            }

            var buffer = Marshal.AllocHGlobal(size);
            try
            {
                var result = WinSpoolApi.DocumentProperties(IntPtr.Zero, printerHandle, printerName, buffer, IntPtr.Zero, WinSpoolApi.DmOutBuffer);
                if (result <= 0)
                {
                    throw new InvalidOperationException($"DocumentProperties fallo al leer DEVMODE. Win32={Marshal.GetLastWin32Error()}");
                }

                var bytes = new byte[size];
                Marshal.Copy(buffer, bytes, 0, size);
                return bytes;
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

    public void ApplyDevModeBytes(string printerName, byte[] devModeBytes)
    {
        if (string.IsNullOrWhiteSpace(printerName))
        {
            throw new ArgumentException("No hay impresora seleccionada.");
        }

        if (devModeBytes is null || devModeBytes.Length == 0)
        {
            throw new ArgumentException("Perfil DEVMODE vacio.");
        }

        if (!WinSpoolApi.OpenPrinter(printerName, out var printerHandle, IntPtr.Zero))
        {
            throw new InvalidOperationException($"OpenPrinter fallo. Win32={Marshal.GetLastWin32Error()}");
        }

        var inputBuffer = IntPtr.Zero;
        var mergedBuffer = IntPtr.Zero;
        var printerInfoBuffer = IntPtr.Zero;

        try
        {
            inputBuffer = Marshal.AllocHGlobal(devModeBytes.Length);
            Marshal.Copy(devModeBytes, 0, inputBuffer, devModeBytes.Length);

            var size = WinSpoolApi.DocumentProperties(IntPtr.Zero, printerHandle, printerName, IntPtr.Zero, IntPtr.Zero, 0);
            if (size <= 0)
            {
                throw new InvalidOperationException($"No se pudo determinar el tamano DEVMODE para aplicar el perfil. Win32={Marshal.GetLastWin32Error()}");
            }

            mergedBuffer = Marshal.AllocHGlobal(size);
            var mergeResult = WinSpoolApi.DocumentProperties(
                IntPtr.Zero,
                printerHandle,
                printerName,
                mergedBuffer,
                inputBuffer,
                WinSpoolApi.DmInBuffer | WinSpoolApi.DmOutBuffer);

            if (mergeResult <= 0)
            {
                throw new InvalidOperationException($"DocumentProperties fallo al fusionar el perfil. Win32={Marshal.GetLastWin32Error()}");
            }

            if (!WinSpoolApi.GetPrinter(printerHandle, 2, IntPtr.Zero, 0, out var needed) && needed <= 0)
            {
                throw new InvalidOperationException("GetPrinter no devolvio un tamano valido.");
            }

            printerInfoBuffer = Marshal.AllocHGlobal(needed);
            if (!WinSpoolApi.GetPrinter(printerHandle, 2, printerInfoBuffer, needed, out needed))
            {
                throw new InvalidOperationException($"GetPrinter fallo. Win32={Marshal.GetLastWin32Error()}");
            }

            var info = Marshal.PtrToStructure<WinSpoolApi.PrinterInfo2>(printerInfoBuffer);
            info.DevMode = mergedBuffer;
            Marshal.StructureToPtr(info, printerInfoBuffer, false);

            if (!WinSpoolApi.SetPrinter(printerHandle, 2, printerInfoBuffer, 0))
            {
                throw new InvalidOperationException($"SetPrinter fallo. Win32={Marshal.GetLastWin32Error()}");
            }
        }
        finally
        {
            if (printerInfoBuffer != IntPtr.Zero) Marshal.FreeHGlobal(printerInfoBuffer);
            if (mergedBuffer != IntPtr.Zero) Marshal.FreeHGlobal(mergedBuffer);
            if (inputBuffer != IntPtr.Zero) Marshal.FreeHGlobal(inputBuffer);
            WinSpoolApi.ClosePrinter(printerHandle);
        }
    }
}
