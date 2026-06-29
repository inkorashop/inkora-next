namespace Inkora.PrintBridge.Models;

public sealed class PrinterInfo
{
    public string Name { get; init; } = "";
    public bool IsDefault { get; init; }
    public bool IsTargetL8050 { get; init; }
    public string StatusText { get; init; } = "Desconocido";
    public string DriverName { get; init; } = "";
    public string PortName { get; init; } = "";
    public uint StatusCode { get; init; }
    public uint Attributes { get; init; }
    public uint JobCount { get; init; }
    public string Error { get; init; } = "";
}
