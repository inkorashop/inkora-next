using System.Diagnostics;
using Inkora.PrintBridge.Models;

namespace Inkora.PrintBridge.Services;

public sealed class PrintJobService
{
    private static readonly string[] SumatraSearchPaths =
    [
        Path.Combine(AppContext.BaseDirectory, "SumatraPDF.exe"), // bundled junto al exe del Bridge
        @"C:\Program Files\SumatraPDF\SumatraPDF.exe",
        @"C:\Program Files (x86)\SumatraPDF\SumatraPDF.exe",
    ];

    private readonly PdfCatalogService _pdfCatalogService;
    private readonly PrinterService _printerService;
    private readonly DevModeService _devModeService;
    private readonly BridgeLogService _logService;
    private readonly object _lock = new();
    private readonly List<PrintJob> _jobs = [];

    public string? SumatraPdfPath { get; private set; }
    public string PrintMethod => SumatraPdfPath is not null ? "SumatraPDF" : "shell-printto";

    public PrintJobService(PdfCatalogService pdfCatalogService, PrinterService printerService, DevModeService devModeService, BridgeLogService logService)
    {
        _pdfCatalogService = pdfCatalogService;
        _printerService = printerService;
        _devModeService = devModeService;
        _logService = logService;
        DetectSumatraPdf();
    }

    private void DetectSumatraPdf()
    {
        foreach (var path in SumatraSearchPaths)
        {
            if (File.Exists(path))
            {
                SumatraPdfPath = path;
                _logService.Info($"SumatraPDF detectado: {path}");
                return;
            }
        }

        try
        {
            var inPath = FindInPath("SumatraPDF.exe");
            if (inPath is not null)
            {
                SumatraPdfPath = inPath;
                _logService.Info($"SumatraPDF detectado en PATH: {inPath}");
                return;
            }
        }
        catch
        {
            // Ignore
        }

        _logService.Info("SumatraPDF no detectado. Se usara shell printto. Para impresion silenciosa, instala SumatraPDF.");
    }

    private static string? FindInPath(string executable)
    {
        var pathDirs = Environment.GetEnvironmentVariable("PATH")?.Split(';') ?? [];
        foreach (var dir in pathDirs)
        {
            var full = Path.Combine(dir.Trim(), executable);
            if (File.Exists(full)) return full;
        }
        return null;
    }

    public PrintJob Prepare(PrintRequest request)
    {
        var candidate = new DesignPdfCandidate
        {
            Id = request.DesignId,
            Name = request.DesignName,
            ProductName = request.ProductName
        };

        var matches = _pdfCatalogService.MatchDesigns([candidate]);
        var match = matches.FirstOrDefault();
        if (match is null || !match.Found)
        {
            throw new InvalidOperationException($"No se encontro PDF local para el diseno '{request.DesignName}'.");
        }

        var roots = _pdfCatalogService.GetRoots();
        var matchRoot = roots.FirstOrDefault(r =>
            string.Equals(r.Name, match.RootName, StringComparison.OrdinalIgnoreCase));
        if (matchRoot is null || !matchRoot.Exists)
        {
            throw new InvalidOperationException($"Carpeta raiz '{match.RootName}' no encontrada.");
        }

        var fullPath = Path.GetFullPath(Path.Combine(matchRoot.Path, match.RelativePath));
        if (!fullPath.StartsWith(matchRoot.Path, StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException("Ruta de PDF fuera de carpeta autorizada.");
        }

        if (!File.Exists(fullPath))
        {
            throw new FileNotFoundException($"PDF no encontrado: {fullPath}");
        }

        var printerName = request.PrinterName;
        if (string.IsNullOrWhiteSpace(printerName))
        {
            var printers = _printerService.GetInstalledPrinters();
            var target = printers.FirstOrDefault(p => p.IsTargetL8050)
                ?? printers.FirstOrDefault(p => p.IsDefault);
            printerName = target?.Name ?? "";
        }

        if (string.IsNullOrWhiteSpace(printerName))
        {
            throw new InvalidOperationException("No se especifico impresora y no se detecto L8050 ni default.");
        }

        var copies = Math.Clamp(request.Copies, 1, 999);

        var job = new PrintJob
        {
            DesignId = request.DesignId,
            DesignName = request.DesignName,
            PrinterName = printerName,
            Copies = copies,
            PdfFileName = match.FileName,
            PdfFullPath = fullPath,
            OrderId = request.OrderId,
            OrderCode = request.OrderCode,
            Status = "queued"
        };

        lock (_lock)
        {
            _jobs.Add(job);
        }

        _logService.Info($"Trabajo preparado: {job.Id} | {job.DesignName} | {job.PdfFileName} x{job.Copies} -> {job.PrinterName}");
        return job;
    }

    public PrintJob? Start(string jobId)
    {
        PrintJob? job;
        lock (_lock)
        {
            job = _jobs.FirstOrDefault(j => j.Id == jobId);
        }

        if (job is null) return null;
        if (job.Status != "queued")
        {
            throw new InvalidOperationException($"El trabajo '{jobId}' no esta en cola (estado: {job.Status}).");
        }

        job.Status = "printing";
        job.StartedAt = DateTimeOffset.Now;

        try
        {
            if (SumatraPdfPath is not null)
            {
                PrintWithSumatra(job);
            }
            else
            {
                PrintWithShellVerb(job);
            }

            job.Status = "done";
            job.CompletedAt = DateTimeOffset.Now;
            _logService.Info($"Trabajo completado: {job.Id} | {job.DesignName} x{job.Copies} via {PrintMethod}");
        }
        catch (Exception ex)
        {
            job.Status = "error";
            job.Error = ex.Message;
            job.CompletedAt = DateTimeOffset.Now;
            _logService.Error($"Error imprimiendo {job.Id}: {ex}");
        }

        return job;
    }

    public PrintJob? PrintNow(PrintRequest request)
    {
        var job = Prepare(request);
        return Start(job.Id);
    }

    public PrintJob? PrintDirect(string rootName, string relativePath, string printerName, int copies)
    {
        var roots = _pdfCatalogService.GetRoots();
        var root = roots.FirstOrDefault(r => string.Equals(r.Name, rootName, StringComparison.OrdinalIgnoreCase));
        if (root is null || !root.Exists)
            throw new InvalidOperationException($"Carpeta '{rootName}' no encontrada o no existe.");

        var fullPath = Path.GetFullPath(Path.Combine(root.Path, relativePath));
        if (!fullPath.StartsWith(root.Path, StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("Ruta de PDF fuera de carpeta autorizada.");

        if (!File.Exists(fullPath))
            throw new FileNotFoundException($"PDF no encontrado: {fullPath}");

        var actualPrinter = printerName;
        if (string.IsNullOrWhiteSpace(actualPrinter))
        {
            var printers = _printerService.GetInstalledPrinters();
            actualPrinter = (printers.FirstOrDefault(p => p.IsTargetL8050) ?? printers.FirstOrDefault(p => p.IsDefault))?.Name ?? "";
        }

        if (string.IsNullOrWhiteSpace(actualPrinter))
            throw new InvalidOperationException("No se especifico impresora y no se detecto L8050 ni default.");

        var fileName = Path.GetFileName(relativePath);
        var job = new PrintJob
        {
            DesignName = Path.GetFileNameWithoutExtension(fileName),
            PrinterName = actualPrinter,
            Copies = Math.Clamp(copies, 1, 999),
            PdfFileName = fileName,
            PdfFullPath = fullPath,
            Status = "queued"
        };

        lock (_lock) { _jobs.Add(job); }
        _logService.Info($"Directo preparado: {job.Id} | {job.DesignName} x{job.Copies} -> {actualPrinter}");
        return Start(job.Id);
    }

    private void PrintWithSumatra(PrintJob job)
    {
        // Aplicar dmCopies en DEVMODE antes de imprimir (SumatraPDF ignora -print-settings copies)
        byte[]? origDevMode = null;
        var devModeModified = false;
        if (job.Copies > 1)
        {
            try
            {
                origDevMode = _devModeService.ReadDefaultDevModeBytes(job.PrinterName);
                var modified = SetDevModeCopies(origDevMode, job.Copies);
                _devModeService.ApplyDevModeBytes(job.PrinterName, modified);
                devModeModified = true;
                _logService.Info($"DEVMODE dmCopies={job.Copies} aplicado para {job.PrinterName}");
            }
            catch (Exception ex)
            {
                _logService.Info($"No se pudo modificar DEVMODE: {ex.Message}. Se imprimira con copia unica.");
            }
        }

        try
        {
            var args = $"-print-to \"{job.PrinterName}\" -silent \"{job.PdfFullPath}\"";
            var psi = new ProcessStartInfo
            {
                FileName = SumatraPdfPath!,
                Arguments = args,
                UseShellExecute = false,
                CreateNoWindow = true,
                WindowStyle = ProcessWindowStyle.Hidden
            };

            using var process = Process.Start(psi);
            process?.WaitForExit(60000);

            if (process is not null && !process.HasExited)
            {
                _logService.Error($"SumatraPDF timeout para {job.Id}. Matando proceso.");
                process.Kill();
                throw new TimeoutException("SumatraPDF no termino en 60 segundos.");
            }

            if (process?.ExitCode != 0)
            {
                _logService.Error($"SumatraPDF salio con codigo {process?.ExitCode} para {job.Id}.");
            }
        }
        finally
        {
            if (devModeModified && origDevMode is not null)
            {
                try { _devModeService.ApplyDevModeBytes(job.PrinterName, origDevMode); }
                catch (Exception ex) { _logService.Info($"No se pudo restaurar DEVMODE: {ex.Message}"); }
            }
        }
    }

    // dmFields en offset 72 (uint), DM_COPIES = 0x100; dmCopies en offset 86 (short)
    private static byte[] SetDevModeCopies(byte[] devMode, int copies)
    {
        var m = (byte[])devMode.Clone();
        if (m.Length >= 76)
        {
            var fields = BitConverter.ToUInt32(m, 72);
            fields |= 0x00000100u; // DM_COPIES
            Buffer.BlockCopy(BitConverter.GetBytes(fields), 0, m, 72, 4);
        }
        if (m.Length >= 88)
        {
            var clamped = (short)Math.Clamp(copies, 1, 999);
            Buffer.BlockCopy(BitConverter.GetBytes(clamped), 0, m, 86, 2);
        }
        return m;
    }

    private void PrintWithShellVerb(PrintJob job)
    {
        for (var i = 0; i < job.Copies; i++)
        {
            var psi = new ProcessStartInfo
            {
                FileName = job.PdfFullPath,
                Verb = "printto",
                Arguments = $"\"{job.PrinterName}\"",
                UseShellExecute = true,
                CreateNoWindow = true,
                WindowStyle = ProcessWindowStyle.Hidden
            };

            using var process = Process.Start(psi);
            process?.WaitForExit(30000);

            if (process is not null && !process.HasExited)
            {
                process.Kill();
            }

            if (job.Copies > 1 && i < job.Copies - 1)
            {
                Thread.Sleep(1500);
            }
        }
    }

    public object GetQueue()
    {
        lock (_lock)
        {
            var recent = _jobs.OrderByDescending(j => j.CreatedAt).Take(50).ToList();
            return new
            {
                total = _jobs.Count,
                queued = _jobs.Count(j => j.Status == "queued"),
                printing = _jobs.Count(j => j.Status == "printing"),
                done = _jobs.Count(j => j.Status == "done"),
                error = _jobs.Count(j => j.Status == "error"),
                printMethod = PrintMethod,
                sumatraPdf = SumatraPdfPath is not null,
                jobs = recent.Select(j => new
                {
                    j.Id,
                    j.DesignId,
                    j.DesignName,
                    j.PrinterName,
                    j.Copies,
                    j.PdfFileName,
                    j.OrderId,
                    j.OrderCode,
                    j.Status,
                    j.Error,
                    j.CreatedAt,
                    j.StartedAt,
                    j.CompletedAt
                }).ToArray()
            };
        }
    }

    public bool Cancel(string jobId)
    {
        lock (_lock)
        {
            var job = _jobs.FirstOrDefault(j => j.Id == jobId);
            if (job is null || job.Status != "queued") return false;
            job.Status = "cancelled";
            job.CompletedAt = DateTimeOffset.Now;
            _logService.Info($"Trabajo cancelado: {jobId}");
            return true;
        }
    }
}
