using System.Net;
using System.Net.Sockets;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Inkora.PrintBridge.Models;

namespace Inkora.PrintBridge.Services;

public sealed class LocalApiServer : IDisposable
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = true,
        PropertyNameCaseInsensitive = true
    };

    private readonly HashSet<string> _allowedOrigins = new(StringComparer.OrdinalIgnoreCase)
    {
        "https://www.inkora.com.ar",
        "https://inkora.com.ar",
        "http://localhost:3000",
        "http://127.0.0.1:3000"
    };

    private readonly PrinterService _printerService;
    private readonly DevModeService _devModeService;
    private readonly DriverPreferencesService _driverPreferencesService;
    private readonly PdfCatalogService _pdfCatalogService;
    private readonly PrintJobService _printJobService;
    private readonly BridgeLogService _logService;
    private readonly string _pairingToken;
    private readonly Func<Task<IReadOnlyList<PdfRootInfo>>> _addPdfRootFromDialogAsync;
    private TcpListener? _listener;
    private CancellationTokenSource? _cancellation;

    public LocalApiServer(
        PrinterService printerService,
        DevModeService devModeService,
        DriverPreferencesService driverPreferencesService,
        PdfCatalogService pdfCatalogService,
        PrintJobService printJobService,
        BridgeLogService logService,
        string pairingToken,
        Func<Task<IReadOnlyList<PdfRootInfo>>> addPdfRootFromDialogAsync,
        int port = 17389)
    {
        _printerService = printerService;
        _devModeService = devModeService;
        _driverPreferencesService = driverPreferencesService;
        _pdfCatalogService = pdfCatalogService;
        _printJobService = printJobService;
        _logService = logService;
        _pairingToken = pairingToken;
        _addPdfRootFromDialogAsync = addPdfRootFromDialogAsync;
        Port = port;
    }

    public int Port { get; }
    public string Url => $"http://127.0.0.1:{Port}";
    public string HealthUrl => $"{Url}/health";
    public bool IsRunning { get; private set; }
    public string LastError { get; private set; } = "";

    public void Start()
    {
        if (IsRunning)
        {
            return;
        }

        try
        {
            _cancellation = new CancellationTokenSource();
            _listener = new TcpListener(IPAddress.Loopback, Port);
            _listener.Start();
            IsRunning = true;
            LastError = "";
            _ = Task.Run(() => AcceptLoopAsync(_cancellation.Token));
            _logService.Info($"API local iniciada en {Url}.");
        }
        catch (Exception exception)
        {
            IsRunning = false;
            LastError = exception.Message;
            _logService.Error($"No se pudo iniciar API local: {exception}");
        }
    }

    public void Dispose()
    {
        try
        {
            _cancellation?.Cancel();
            _listener?.Stop();
        }
        catch
        {
            // Shutdown is best effort.
        }
        finally
        {
            IsRunning = false;
            _cancellation?.Dispose();
        }
    }

    private async Task AcceptLoopAsync(CancellationToken cancellationToken)
    {
        while (!cancellationToken.IsCancellationRequested && _listener is not null)
        {
            try
            {
                var client = await _listener.AcceptTcpClientAsync(cancellationToken);
                _ = Task.Run(() => HandleClientAsync(client, cancellationToken), cancellationToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
            catch (Exception exception)
            {
                LastError = exception.Message;
                _logService.Error($"Error aceptando conexion API local: {exception}");
            }
        }
    }

    private async Task HandleClientAsync(TcpClient client, CancellationToken cancellationToken)
    {
        using var _client = client;

        if (client.Client.RemoteEndPoint is not IPEndPoint remote || !IPAddress.IsLoopback(remote.Address))
        {
            await WriteJsonAsync(client.GetStream(), 403, "Forbidden", new { ok = false, error = "Solo loopback." }, null, cancellationToken);
            return;
        }

        var stream = client.GetStream();
        var request = await ReadRequestAsync(stream, cancellationToken);
        if (request is null || string.IsNullOrWhiteSpace(request.RequestLine))
        {
            return;
        }

        var parts = request.RequestLine.Split(' ', 3, StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length < 2)
        {
            await WriteJsonAsync(stream, 400, "Bad Request", new { ok = false, error = "Request invalido." }, null, cancellationToken);
            return;
        }

        var method = parts[0].Trim().ToUpperInvariant();
        var target = parts[1].Trim();
        var headers = request.Headers;
        var body = request.Body;
        var origin = GetAllowedOrigin(headers);

        if (headers.TryGetValue("Origin", out var requestOrigin) && origin is null)
        {
            await WriteJsonAsync(stream, 403, "Forbidden", new { ok = false, error = "Origen no permitido." }, null, cancellationToken);
            return;
        }

        if (method == "OPTIONS")
        {
            await WriteOptionsAsync(stream, origin, cancellationToken);
            return;
        }

        if (method is not ("GET" or "POST"))
        {
            await WriteJsonAsync(stream, 405, "Method Not Allowed", new { ok = false, error = "Metodo no permitido." }, origin, cancellationToken);
            return;
        }

        var path = GetPath(target);
        switch (path)
        {
            case "/health":
                if (method != "GET")
                {
                    await WriteJsonAsync(stream, 405, "Method Not Allowed", new { ok = false, error = "Usa GET." }, origin, cancellationToken);
                    return;
                }

                await WriteJsonAsync(stream, 200, "OK", BuildHealthPayload(), origin, cancellationToken);
                break;

            case "/printers":
                if (method != "GET")
                {
                    await WriteJsonAsync(stream, 405, "Method Not Allowed", new { ok = false, error = "Usa GET." }, origin, cancellationToken);
                    return;
                }

                if (!IsAuthorized(headers))
                {
                    await WriteJsonAsync(stream, 401, "Unauthorized", new { ok = false, error = "Token Bridge requerido." }, origin, cancellationToken);
                    return;
                }

                await WriteJsonAsync(stream, 200, "OK", new
                {
                    ok = true,
                    printers = _printerService.GetInstalledPrinters(),
                    timestamp = DateTimeOffset.Now
                }, origin, cancellationToken);
                break;

            case "/devmode":
                if (method != "GET")
                {
                    await WriteJsonAsync(stream, 405, "Method Not Allowed", new { ok = false, error = "Usa GET." }, origin, cancellationToken);
                    return;
                }

                if (!IsAuthorized(headers))
                {
                    await WriteJsonAsync(stream, 401, "Unauthorized", new { ok = false, error = "Token Bridge requerido." }, origin, cancellationToken);
                    return;
                }

                var devModePrinter = GetQueryValue(target, "printer");
                await WriteJsonAsync(stream, 200, "OK", new
                {
                    ok = true,
                    devMode = _devModeService.ReadDefaultDevMode(devModePrinter),
                    timestamp = DateTimeOffset.Now
                }, origin, cancellationToken);
                break;

            case "/driver/open-preferences":
                if (method != "POST")
                {
                    await WriteJsonAsync(stream, 405, "Method Not Allowed", new { ok = false, error = "Usa POST." }, origin, cancellationToken);
                    return;
                }

                if (!IsAuthorized(headers))
                {
                    await WriteJsonAsync(stream, 401, "Unauthorized", new { ok = false, error = "Token Bridge requerido." }, origin, cancellationToken);
                    return;
                }

                var preferencePrinter = GetQueryValue(target, "printer");
                _driverPreferencesService.OpenPrinterPreferences(preferencePrinter);
                _logService.Info($"Preferencias abiertas desde API local para {preferencePrinter}.");
                await WriteJsonAsync(stream, 200, "OK", new
                {
                    ok = true,
                    printer = preferencePrinter,
                    timestamp = DateTimeOffset.Now
                }, origin, cancellationToken);
                break;

            case "/pdf-roots":
                if (method != "GET")
                {
                    await WriteJsonAsync(stream, 405, "Method Not Allowed", new { ok = false, error = "Usa GET." }, origin, cancellationToken);
                    return;
                }

                if (!IsAuthorized(headers))
                {
                    await WriteJsonAsync(stream, 401, "Unauthorized", new { ok = false, error = "Token Bridge requerido." }, origin, cancellationToken);
                    return;
                }

                await WriteJsonAsync(stream, 200, "OK", new
                {
                    ok = true,
                    roots = _pdfCatalogService.GetRoots(),
                    pdfCount = _pdfCatalogService.GetCachedPdfs().Count,
                    timestamp = DateTimeOffset.Now
                }, origin, cancellationToken);
                break;

            case "/pdf-roots/add-dialog":
                if (method != "POST")
                {
                    await WriteJsonAsync(stream, 405, "Method Not Allowed", new { ok = false, error = "Usa POST." }, origin, cancellationToken);
                    return;
                }

                if (!IsAuthorized(headers))
                {
                    await WriteJsonAsync(stream, 401, "Unauthorized", new { ok = false, error = "Token Bridge requerido." }, origin, cancellationToken);
                    return;
                }

                var roots = await _addPdfRootFromDialogAsync();
                await WriteJsonAsync(stream, 200, "OK", new
                {
                    ok = true,
                    roots,
                    pdfCount = _pdfCatalogService.GetCachedPdfs().Count,
                    timestamp = DateTimeOffset.Now
                }, origin, cancellationToken);
                break;

            case "/pdf-scan":
                if (method != "POST")
                {
                    await WriteJsonAsync(stream, 405, "Method Not Allowed", new { ok = false, error = "Usa POST." }, origin, cancellationToken);
                    return;
                }

                if (!IsAuthorized(headers))
                {
                    await WriteJsonAsync(stream, 401, "Unauthorized", new { ok = false, error = "Token Bridge requerido." }, origin, cancellationToken);
                    return;
                }

                var pdfs = _pdfCatalogService.Scan();
                _logService.Info($"Escaneo PDF desde API local. Total={pdfs.Count}.");
                await WriteJsonAsync(stream, 200, "OK", new
                {
                    ok = true,
                    roots = _pdfCatalogService.GetRoots(),
                    pdfCount = pdfs.Count,
                    sample = pdfs.Take(20).ToArray(),
                    timestamp = DateTimeOffset.Now
                }, origin, cancellationToken);
                break;

            case "/design-pdfs/match":
                if (method != "POST")
                {
                    await WriteJsonAsync(stream, 405, "Method Not Allowed", new { ok = false, error = "Usa POST." }, origin, cancellationToken);
                    return;
                }

                if (!IsAuthorized(headers))
                {
                    await WriteJsonAsync(stream, 401, "Unauthorized", new { ok = false, error = "Token Bridge requerido." }, origin, cancellationToken);
                    return;
                }

                var matchRequest = ParseDesignMatchRequest(body);
                var matches = _pdfCatalogService.MatchDesigns(matchRequest.Designs);
                await WriteJsonAsync(stream, 200, "OK", new
                {
                    ok = true,
                    roots = _pdfCatalogService.GetRoots(),
                    pdfCount = _pdfCatalogService.GetCachedPdfs().Count,
                    matches,
                    found = matches.Count(match => match.Found),
                    missing = matches.Count(match => !match.Found),
                    timestamp = DateTimeOffset.Now
                }, origin, cancellationToken);
                break;

            case "/print":
                if (method != "POST")
                {
                    await WriteJsonAsync(stream, 405, "Method Not Allowed", new { ok = false, error = "Usa POST." }, origin, cancellationToken);
                    return;
                }

                if (!IsAuthorized(headers))
                {
                    await WriteJsonAsync(stream, 401, "Unauthorized", new { ok = false, error = "Token Bridge requerido." }, origin, cancellationToken);
                    return;
                }

                try
                {
                    var printRequest = ParsePrintRequest(body);
                    var printJob = _printJobService.PrintNow(printRequest);
                    await WriteJsonAsync(stream, 200, "OK", new
                    {
                        ok = true,
                        job = printJob is null ? null : new
                        {
                            printJob.Id,
                            printJob.DesignId,
                            printJob.DesignName,
                            printJob.PrinterName,
                            printJob.Copies,
                            printJob.PdfFileName,
                            printJob.OrderId,
                            printJob.OrderCode,
                            printJob.Status,
                            printJob.Error,
                            printJob.CreatedAt,
                            printJob.StartedAt,
                            printJob.CompletedAt
                        },
                        printMethod = _printJobService.PrintMethod,
                        timestamp = DateTimeOffset.Now
                    }, origin, cancellationToken);
                }
                catch (Exception printError)
                {
                    _logService.Error($"Error en /print: {printError}");
                    await WriteJsonAsync(stream, 400, "Bad Request", new
                    {
                        ok = false,
                        error = printError.Message,
                        timestamp = DateTimeOffset.Now
                    }, origin, cancellationToken);
                }
                break;

            case "/print/queue":
                if (method != "GET")
                {
                    await WriteJsonAsync(stream, 405, "Method Not Allowed", new { ok = false, error = "Usa GET." }, origin, cancellationToken);
                    return;
                }

                if (!IsAuthorized(headers))
                {
                    await WriteJsonAsync(stream, 401, "Unauthorized", new { ok = false, error = "Token Bridge requerido." }, origin, cancellationToken);
                    return;
                }

                await WriteJsonAsync(stream, 200, "OK", new
                {
                    ok = true,
                    queue = _printJobService.GetQueue(),
                    timestamp = DateTimeOffset.Now
                }, origin, cancellationToken);
                break;

            case "/print/cancel":
                if (method != "POST")
                {
                    await WriteJsonAsync(stream, 405, "Method Not Allowed", new { ok = false, error = "Usa POST." }, origin, cancellationToken);
                    return;
                }

                if (!IsAuthorized(headers))
                {
                    await WriteJsonAsync(stream, 401, "Unauthorized", new { ok = false, error = "Token Bridge requerido." }, origin, cancellationToken);
                    return;
                }

                var cancelJobId = GetQueryValue(target, "id");
                var cancelled = _printJobService.Cancel(cancelJobId);
                await WriteJsonAsync(stream, 200, "OK", new
                {
                    ok = true,
                    cancelled,
                    jobId = cancelJobId,
                    timestamp = DateTimeOffset.Now
                }, origin, cancellationToken);
                break;

            default:
                await WriteJsonAsync(stream, 404, "Not Found", new { ok = false, error = "Endpoint no encontrado." }, origin, cancellationToken);
                break;
        }
    }

    private object BuildHealthPayload()
    {
        var version = Assembly.GetExecutingAssembly().GetName().Version?.ToString() ?? "dev";

        return new
        {
            ok = true,
            app = "INKORA Print Bridge",
            version,
            apiVersion = 1,
            url = Url,
            localOnly = true,
            tokenRequired = true,
            endpoints = new[] { "/health", "/printers", "/devmode", "/driver/open-preferences", "/pdf-roots", "/pdf-roots/add-dialog", "/pdf-scan", "/design-pdfs/match", "/print", "/print/queue", "/print/cancel" },
            printMethod = _printJobService.PrintMethod,
            sumatraPdf = _printJobService.SumatraPdfPath is not null,
            allowedOrigins = _allowedOrigins.OrderBy(origin => origin).ToArray(),
            timestamp = DateTimeOffset.Now
        };
    }

    private static async Task<HttpRequest?> ReadRequestAsync(NetworkStream stream, CancellationToken cancellationToken)
    {
        var buffer = new List<byte>(8192);
        var chunk = new byte[4096];
        var headerEnd = -1;

        while (headerEnd < 0)
        {
            var read = await stream.ReadAsync(chunk, cancellationToken);
            if (read <= 0)
            {
                return null;
            }

            buffer.AddRange(chunk.Take(read));
            headerEnd = FindHeaderEnd(buffer);
            if (buffer.Count > 128_000)
            {
                throw new InvalidOperationException("Headers demasiado grandes.");
            }
        }

        var headerBytes = buffer.Take(headerEnd).ToArray();
        var headerText = Encoding.ASCII.GetString(headerBytes);
        var lines = headerText.Replace("\r\n", "\n").Split('\n', StringSplitOptions.None);
        if (lines.Length == 0)
        {
            return null;
        }

        var headers = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var line in lines.Skip(1))
        {
            var separator = line.IndexOf(':');
            if (separator <= 0) continue;
            headers[line[..separator].Trim()] = line[(separator + 1)..].Trim();
        }

        if (!headers.TryGetValue("Content-Length", out var lengthText) || !int.TryParse(lengthText, out var length) || length <= 0)
        {
            return new HttpRequest(lines[0], headers, "");
        }

        if (length > 2_000_000)
        {
            throw new InvalidOperationException("Body demasiado grande.");
        }

        var bodyStart = headerEnd + HeaderSeparatorLength(buffer, headerEnd);
        var bodyBytes = buffer.Skip(bodyStart).Take(length).ToList();
        while (bodyBytes.Count < length)
        {
            var read = await stream.ReadAsync(chunk.AsMemory(0, Math.Min(chunk.Length, length - bodyBytes.Count)), cancellationToken);
            if (read <= 0)
            {
                break;
            }
            bodyBytes.AddRange(chunk.Take(read));
        }

        return new HttpRequest(lines[0], headers, Encoding.UTF8.GetString(bodyBytes.Take(length).ToArray()));
    }

    private static int FindHeaderEnd(IReadOnlyList<byte> bytes)
    {
        for (var i = 0; i <= bytes.Count - 4; i++)
        {
            if (bytes[i] == 13 && bytes[i + 1] == 10 && bytes[i + 2] == 13 && bytes[i + 3] == 10)
            {
                return i;
            }
        }

        for (var i = 0; i <= bytes.Count - 2; i++)
        {
            if (bytes[i] == 10 && bytes[i + 1] == 10)
            {
                return i;
            }
        }

        return -1;
    }

    private static int HeaderSeparatorLength(IReadOnlyList<byte> bytes, int headerEnd)
    {
        return headerEnd + 3 < bytes.Count
            && bytes[headerEnd] == 13
            && bytes[headerEnd + 1] == 10
            && bytes[headerEnd + 2] == 13
            && bytes[headerEnd + 3] == 10
                ? 4
                : 2;
    }

    private static PrintRequest ParsePrintRequest(string body)
    {
        if (string.IsNullOrWhiteSpace(body))
        {
            return new PrintRequest();
        }

        return JsonSerializer.Deserialize<PrintRequest>(body, JsonOptions) ?? new PrintRequest();
    }

    private static DesignMatchRequest ParseDesignMatchRequest(string body)
    {
        if (string.IsNullOrWhiteSpace(body))
        {
            return new DesignMatchRequest();
        }

        return JsonSerializer.Deserialize<DesignMatchRequest>(body, JsonOptions) ?? new DesignMatchRequest();
    }

    private string? GetAllowedOrigin(IReadOnlyDictionary<string, string> headers)
    {
        if (!headers.TryGetValue("Origin", out var origin) || string.IsNullOrWhiteSpace(origin))
        {
            return null;
        }

        return _allowedOrigins.Contains(origin) ? origin : null;
    }

    private bool IsAuthorized(IReadOnlyDictionary<string, string> headers)
    {
        if (!headers.TryGetValue("X-Inkora-Bridge-Token", out var providedToken))
        {
            return false;
        }

        var expectedBytes = Encoding.UTF8.GetBytes(_pairingToken);
        var providedBytes = Encoding.UTF8.GetBytes(providedToken);
        return expectedBytes.Length == providedBytes.Length
            && CryptographicOperations.FixedTimeEquals(expectedBytes, providedBytes);
    }

    private static string GetPath(string target)
    {
        var queryIndex = target.IndexOf('?');
        return queryIndex >= 0 ? target[..queryIndex] : target;
    }

    private string GetQueryValue(string target, string key)
    {
        var queryIndex = target.IndexOf('?');
        var printers = _printerService.GetInstalledPrinters();
        var fallback = printers.FirstOrDefault(printer => printer.IsTargetL8050)?.Name
            ?? printers.FirstOrDefault(printer => printer.IsDefault)?.Name
            ?? printers.FirstOrDefault()?.Name
            ?? "";

        if (queryIndex < 0 || queryIndex == target.Length - 1)
        {
            return fallback;
        }

        var query = target[(queryIndex + 1)..];
        foreach (var part in query.Split('&', StringSplitOptions.RemoveEmptyEntries))
        {
            var segments = part.Split('=', 2);
            if (segments.Length == 2 && string.Equals(WebUtility.UrlDecode(segments[0]), key, StringComparison.OrdinalIgnoreCase))
            {
                var value = WebUtility.UrlDecode(segments[1]);
                return string.IsNullOrWhiteSpace(value) ? fallback : value;
            }
        }

        return fallback;
    }

    private static async Task WriteOptionsAsync(Stream stream, string? origin, CancellationToken cancellationToken)
    {
        var builder = new StringBuilder();
        builder.AppendLine("HTTP/1.1 204 No Content");
        AppendBaseHeaders(builder, origin);
        builder.AppendLine("Access-Control-Allow-Methods: GET, POST, OPTIONS");
        builder.AppendLine("Access-Control-Allow-Headers: Content-Type, X-Inkora-Bridge-Token");
        builder.AppendLine("Access-Control-Max-Age: 600");
        builder.AppendLine("Content-Length: 0");
        builder.AppendLine();

        var bytes = Encoding.ASCII.GetBytes(builder.ToString());
        await stream.WriteAsync(bytes, cancellationToken);
    }

    private static async Task WriteJsonAsync(
        Stream stream,
        int status,
        string reason,
        object payload,
        string? origin,
        CancellationToken cancellationToken)
    {
        var body = JsonSerializer.Serialize(payload, JsonOptions);
        var bodyBytes = Encoding.UTF8.GetBytes(body);
        var builder = new StringBuilder();
        builder.AppendLine($"HTTP/1.1 {status} {reason}");
        AppendBaseHeaders(builder, origin);
        builder.AppendLine("Content-Type: application/json; charset=utf-8");
        builder.AppendLine($"Content-Length: {bodyBytes.Length}");
        builder.AppendLine();

        var headerBytes = Encoding.ASCII.GetBytes(builder.ToString());
        await stream.WriteAsync(headerBytes, cancellationToken);
        await stream.WriteAsync(bodyBytes, cancellationToken);
    }

    private static void AppendBaseHeaders(StringBuilder builder, string? origin)
    {
        builder.AppendLine("Connection: close");
        builder.AppendLine("Cache-Control: no-store");
        builder.AppendLine("X-Content-Type-Options: nosniff");

        if (!string.IsNullOrWhiteSpace(origin))
        {
            builder.AppendLine($"Access-Control-Allow-Origin: {origin}");
            builder.AppendLine("Vary: Origin");
        }
    }

    private sealed class DesignMatchRequest
    {
        public List<DesignPdfCandidate> Designs { get; init; } = [];
    }

    private sealed record HttpRequest(string RequestLine, Dictionary<string, string> Headers, string Body);
}
