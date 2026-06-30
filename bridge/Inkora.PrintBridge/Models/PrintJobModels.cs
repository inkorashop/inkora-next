namespace Inkora.PrintBridge.Models;

public sealed class PrintRequest
{
    public string DesignId { get; init; } = "";
    public string DesignName { get; init; } = "";
    public string ProductName { get; init; } = "";
    public string PrinterName { get; init; } = "";
    public int Copies { get; init; } = 1;
    public string OrderId { get; init; } = "";
    public string OrderCode { get; init; } = "";
}

public sealed class PrintJob
{
    public string Id { get; init; } = Guid.NewGuid().ToString("N")[..12];
    public string DesignId { get; set; } = "";
    public string DesignName { get; set; } = "";
    public string PrinterName { get; set; } = "";
    public int Copies { get; set; } = 1;
    public string PdfFileName { get; set; } = "";
    public string PdfFullPath { get; set; } = "";
    public string OrderId { get; set; } = "";
    public string OrderCode { get; set; } = "";
    public string Status { get; set; } = "queued";
    public string Error { get; set; } = "";
    public int? PagesPrinted { get; set; }
    public DateTimeOffset CreatedAt { get; init; } = DateTimeOffset.Now;
    public DateTimeOffset? StartedAt { get; set; }
    public DateTimeOffset? CompletedAt { get; set; }
}
