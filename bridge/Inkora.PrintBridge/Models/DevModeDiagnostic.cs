namespace Inkora.PrintBridge.Models;

public sealed class DevModeDiagnostic
{
    public string PrinterName { get; init; } = "";
    public int QuerySize { get; init; }
    public int ResultCode { get; init; }
    public string DeviceName { get; init; } = "";
    public ushort SpecVersion { get; init; }
    public ushort DriverVersion { get; init; }
    public ushort PublicSize { get; init; }
    public ushort DriverExtra { get; init; }
    public string FieldsHex { get; init; } = "";
    public string HeaderHex { get; init; } = "";
    public string Error { get; init; } = "";

    public bool IsSuccess => string.IsNullOrWhiteSpace(Error) && QuerySize > 0 && ResultCode > 0;
}
