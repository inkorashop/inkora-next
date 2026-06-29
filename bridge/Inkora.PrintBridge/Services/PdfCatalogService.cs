using System.Text.Json;
using System.Text.RegularExpressions;
using Inkora.PrintBridge.Models;

namespace Inkora.PrintBridge.Services;

public sealed class PdfCatalogService
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = true
    };

    private readonly BridgeConfigService _configService;
    private readonly BridgeLogService _logService;
    private readonly object _lock = new();
    private List<string> _roots = [];
    private List<PdfFileInfo> _pdfs = [];

    public PdfCatalogService(BridgeConfigService configService, BridgeLogService logService)
    {
        _configService = configService;
        _logService = logService;
        LoadRoots();
    }

    private string RootsFilePath => Path.Combine(_configService.ConfigRoot, "pdf-roots.json");

    public IReadOnlyList<PdfRootInfo> GetRoots()
    {
        lock (_lock)
        {
            return _roots
                .Select(path => new PdfRootInfo
                {
                    Path = path,
                    Name = new DirectoryInfo(path).Name,
                    Exists = Directory.Exists(path)
                })
                .ToList();
        }
    }

    public IReadOnlyList<PdfFileInfo> GetCachedPdfs()
    {
        lock (_lock)
        {
            return _pdfs.ToList();
        }
    }

    public int AddRootFromDialog(IWin32Window owner)
    {
        using var dialog = new FolderBrowserDialog
        {
            Description = "Seleccionar carpeta autorizada de PDFs de INKORA",
            UseDescriptionForTitle = true,
            ShowNewFolderButton = false
        };

        if (dialog.ShowDialog(owner) != DialogResult.OK || string.IsNullOrWhiteSpace(dialog.SelectedPath))
        {
            return GetRoots().Count;
        }

        AddRoot(dialog.SelectedPath);
        return GetRoots().Count;
    }

    public void AddRoot(string path)
    {
        var fullPath = Path.GetFullPath(path);
        if (!Directory.Exists(fullPath))
        {
            throw new DirectoryNotFoundException($"La carpeta no existe: {fullPath}");
        }

        lock (_lock)
        {
            if (!_roots.Any(root => string.Equals(root, fullPath, StringComparison.OrdinalIgnoreCase)))
            {
                _roots.Add(fullPath);
                SaveRoots();
            }
        }

        _logService.Info($"Carpeta PDF autorizada: {fullPath}");
    }

    public IReadOnlyList<PdfFileInfo> Scan()
    {
        List<string> roots;
        lock (_lock)
        {
            roots = _roots.ToList();
        }

        var files = new List<PdfFileInfo>();
        foreach (var root in roots)
        {
            if (!Directory.Exists(root))
            {
                continue;
            }

            foreach (var path in EnumeratePdfFilesSafe(root))
            {
                var info = new FileInfo(path);
                var relative = Path.GetRelativePath(root, path);
                files.Add(new PdfFileInfo
                {
                    FileName = info.Name,
                    RootName = new DirectoryInfo(root).Name,
                    RelativePath = relative,
                    SizeBytes = info.Length,
                    LastWriteTime = info.LastWriteTime,
                    NormalizedName = NormalizeCompact(Path.GetFileNameWithoutExtension(info.Name)),
                    NormalizedText = NormalizeText(Path.GetFileNameWithoutExtension(info.Name))
                });
            }
        }

        lock (_lock)
        {
            _pdfs = files
                .OrderBy(file => file.RootName, StringComparer.OrdinalIgnoreCase)
                .ThenBy(file => file.RelativePath, StringComparer.OrdinalIgnoreCase)
                .ToList();
            return _pdfs.ToList();
        }
    }

    public IReadOnlyList<DesignPdfMatch> MatchDesigns(IEnumerable<DesignPdfCandidate> designs)
    {
        var pdfs = GetCachedPdfs();
        if (pdfs.Count == 0)
        {
            pdfs = Scan();
        }

        return designs.Select(design => MatchDesign(design, pdfs)).ToList();
    }

    private DesignPdfMatch MatchDesign(DesignPdfCandidate design, IReadOnlyList<PdfFileInfo> pdfs)
    {
        var designId = StringValue(design.Id);
        var designName = StringValue(design.Name);
        var productName = StringValue(design.ProductName);
        var normalizedId = NormalizeCompact(designId);
        var normalizedName = NormalizeCompact(designName);
        var normalizedText = NormalizeText(designName);
        var normalizedProduct = NormalizeText(productName);

        var bestScore = 0;
        var bestType = "";
        PdfFileInfo? bestPdf = null;

        foreach (var pdf in pdfs)
        {
            var score = 0;
            var type = "";

            if (!string.IsNullOrWhiteSpace(normalizedId) && pdf.NormalizedName.Contains(normalizedId, StringComparison.OrdinalIgnoreCase))
            {
                score = 100;
                type = "id";
            }
            else if (!string.IsNullOrWhiteSpace(normalizedName) && pdf.NormalizedName == normalizedName)
            {
                score = 95;
                type = "nombre exacto";
            }
            else if (!string.IsNullOrWhiteSpace(normalizedText) && ContainsWholePhrase(pdf.NormalizedText, normalizedText))
            {
                score = 88;
                type = "nombre dentro del archivo";
            }

            if (score > 0 && !string.IsNullOrWhiteSpace(normalizedProduct) && ContainsWholePhrase(pdf.NormalizedText, normalizedProduct))
            {
                score += 4;
            }

            if (score > bestScore)
            {
                bestScore = score;
                bestType = type;
                bestPdf = pdf;
            }
        }

        if (bestPdf is null)
        {
            return new DesignPdfMatch
            {
                Id = designId,
                Name = designName,
                Found = false
            };
        }

        return new DesignPdfMatch
        {
            Id = designId,
            Name = designName,
            Found = true,
            MatchType = bestType,
            Score = bestScore,
            FileName = bestPdf.FileName,
            RootName = bestPdf.RootName,
            RelativePath = bestPdf.RelativePath,
            SizeBytes = bestPdf.SizeBytes,
            LastWriteTime = bestPdf.LastWriteTime
        };
    }

    private void LoadRoots()
    {
        try
        {
            if (!File.Exists(RootsFilePath))
            {
                return;
            }

            var roots = JsonSerializer.Deserialize<List<string>>(File.ReadAllText(RootsFilePath), JsonOptions) ?? [];
            _roots = roots
                .Where(root => !string.IsNullOrWhiteSpace(root))
                .Select(Path.GetFullPath)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();
        }
        catch (Exception exception)
        {
            _logService.Error($"No se pudieron cargar carpetas PDF: {exception}");
            _roots = [];
        }
    }

    private void SaveRoots()
    {
        File.WriteAllText(RootsFilePath, JsonSerializer.Serialize(_roots, JsonOptions));
    }

    private static IEnumerable<string> EnumeratePdfFilesSafe(string root)
    {
        var pending = new Stack<string>();
        pending.Push(root);

        while (pending.Count > 0)
        {
            var current = pending.Pop();
            IEnumerable<string> files = [];
            IEnumerable<string> directories = [];

            try
            {
                files = Directory.EnumerateFiles(current, "*.pdf", SearchOption.TopDirectoryOnly);
                directories = Directory.EnumerateDirectories(current);
            }
            catch
            {
                // Skip folders without access.
            }

            foreach (var file in files)
            {
                yield return file;
            }

            foreach (var directory in directories)
            {
                pending.Push(directory);
            }
        }
    }

    private static bool ContainsWholePhrase(string haystack, string phrase)
    {
        if (string.IsNullOrWhiteSpace(haystack) || string.IsNullOrWhiteSpace(phrase))
        {
            return false;
        }

        return $" {haystack} ".Contains($" {phrase} ", StringComparison.OrdinalIgnoreCase);
    }

    private static string NormalizeCompact(string value)
    {
        return Regex.Replace(NormalizeText(value), @"\s+", "");
    }

    private static string NormalizeText(string value)
    {
        var normalized = StringValue(value).Normalize(System.Text.NormalizationForm.FormD);
        var chars = normalized.Where(ch => System.Globalization.CharUnicodeInfo.GetUnicodeCategory(ch) != System.Globalization.UnicodeCategory.NonSpacingMark).ToArray();
        var withoutAccents = new string(chars).Normalize(System.Text.NormalizationForm.FormC).ToLowerInvariant();
        return Regex.Replace(withoutAccents, @"[^a-z0-9]+", " ").Trim();
    }

    private static string StringValue(string? value)
    {
        return (value ?? "").Trim();
    }
}
