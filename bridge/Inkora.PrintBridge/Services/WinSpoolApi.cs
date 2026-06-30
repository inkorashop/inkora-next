using System.Runtime.InteropServices;

namespace Inkora.PrintBridge.Services;

internal static class WinSpoolApi
{
    internal const int DmOutBuffer = 2;
    internal const int DmInBuffer = 8;

    [DllImport("winspool.drv", SetLastError = true, CharSet = CharSet.Auto)]
    internal static extern bool OpenPrinter(string pPrinterName, out IntPtr phPrinter, IntPtr pDefault);

    [DllImport("winspool.drv", SetLastError = true)]
    internal static extern bool ClosePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", SetLastError = true, CharSet = CharSet.Auto)]
    internal static extern bool GetPrinter(
        IntPtr hPrinter,
        int level,
        IntPtr pPrinter,
        int cbBuf,
        out int pcbNeeded);

    [DllImport("winspool.drv", SetLastError = true, CharSet = CharSet.Auto)]
    internal static extern bool SetPrinter(
        IntPtr hPrinter,
        int level,
        IntPtr pPrinter,
        int command);

    [DllImport("winspool.drv", SetLastError = true, CharSet = CharSet.Auto)]
    internal static extern int DocumentProperties(
        IntPtr hwnd,
        IntPtr hPrinter,
        string pDeviceName,
        IntPtr pDevModeOutput,
        IntPtr pDevModeInput,
        int fMode);

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Auto)]
    internal struct PrinterInfo2
    {
        public string? ServerName;
        public string? PrinterName;
        public string? ShareName;
        public string? PortName;
        public string? DriverName;
        public string? Comment;
        public string? Location;
        public IntPtr DevMode;
        public string? SepFile;
        public string? PrintProcessor;
        public string? Datatype;
        public string? Parameters;
        public IntPtr SecurityDescriptor;
        public uint Attributes;
        public uint Priority;
        public uint DefaultPriority;
        public uint StartTime;
        public uint UntilTime;
        public uint Status;
        public uint Jobs;
        public uint AveragePagesPerMinute;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Auto)]
    internal struct DevModeHeader
    {
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)]
        public string DeviceName;

        public ushort SpecVersion;
        public ushort DriverVersion;
        public ushort Size;
        public ushort DriverExtra;
        public uint Fields;
    }
}
