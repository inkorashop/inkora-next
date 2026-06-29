namespace Inkora.PrintBridge.Models;

public sealed class PdfRootInfo
{
    public string Path { get; init; } = "";
    public string Name { get; init; } = "";
    public bool Exists { get; init; }
}

public sealed class PdfFileInfo
{
    public string FileName { get; init; } = "";
    public string RootName { get; init; } = "";
    public string RelativePath { get; init; } = "";
    public long SizeBytes { get; init; }
    public DateTimeOffset LastWriteTime { get; init; }
    public string NormalizedName { get; init; } = "";
    public string NormalizedText { get; init; } = "";
}

public sealed class DesignPdfCandidate
{
    public string Id { get; init; } = "";
    public string Name { get; init; } = "";
    public string ProductName { get; init; } = "";
}

public sealed class DesignPdfMatch
{
    public string Id { get; init; } = "";
    public string Name { get; init; } = "";
    public bool Found { get; init; }
    public string MatchType { get; init; } = "";
    public int Score { get; init; }
    public string FileName { get; init; } = "";
    public string RootName { get; init; } = "";
    public string RelativePath { get; init; } = "";
    public long SizeBytes { get; init; }
    public DateTimeOffset? LastWriteTime { get; init; }
}
