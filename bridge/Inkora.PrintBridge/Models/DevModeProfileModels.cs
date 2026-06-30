namespace Inkora.PrintBridge.Models;

public sealed class DevModeProfileInfo
{
    public string Name { get; init; } = "";
    public string PrinterName { get; init; } = "";
    public int SizeBytes { get; init; }
    public DateTimeOffset SavedAt { get; init; } = DateTimeOffset.Now;
}
