using System.ComponentModel;
using System.IO.Compression;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using Inkora.PrintBridge.Models;
using Inkora.PrintBridge.Services;

namespace Inkora.PrintBridge;

public sealed class MainForm : Form
{
    private static readonly Color InkoraBlue = ColorTranslator.FromHtml("#1B2F5E");
    private static readonly Color InkoraBlueDark = ColorTranslator.FromHtml("#10244A");
    private static readonly Color InkoraBlueSoft = ColorTranslator.FromHtml("#EAF1FF");
    private static readonly Color InkoraBorder = ColorTranslator.FromHtml("#DDE6F7");
    private static readonly Color InkoraBg = ColorTranslator.FromHtml("#F6F8FC");

    private readonly PrinterService _printerService = new();
    private readonly DevModeService _devModeService = new();
    private readonly DriverPreferencesService _driverPreferencesService = new();
    private readonly BridgeLogService _logService = new();
    private readonly BridgeConfigService _configService = new();
    private readonly PdfCatalogService _pdfCatalogService;
    private readonly PrintJobService _printJobService;
    private readonly DevModeProfileService _devModeProfileService;
    private readonly LocalApiServer _localApiServer;
    private readonly string _bridgeToken;
    private readonly bool _startedAfterUpdate;

    private readonly DataGridView _printersGrid = new();
    private readonly TextBox _tokenTextBox = new();
    private readonly TextBox _diagnosticTextBox = new();
    private TextBox? _networkUrlBox;
    private readonly Label _statusLabel = new();
    private readonly Label _apiLabel = new();
    private readonly Label _pdfLabel = new();
    private readonly Button _refreshButton = new();
    private readonly Button _openPreferencesButton = new();
    private readonly Button _readDevModeButton = new();
    private readonly Button _copyButton = new();
    private readonly Button _openLogButton = new();
    private readonly Button _copyTokenButton = new();
    private readonly Button _openHealthButton = new();
    private readonly Button _addPdfRootButton = new();
    private readonly Button _scanPdfsButton = new();

    private BindingList<PrinterInfo> _printers = new();
    private NotifyIcon _notifyIcon = new();
    private bool _allowClose;
    private volatile string _updatePhase = "idle";

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool SetForegroundWindow(IntPtr hWnd);

    public MainForm()
    {
        _startedAfterUpdate = Environment.GetCommandLineArgs()
            .Any(arg => string.Equals(arg, "--updated", StringComparison.OrdinalIgnoreCase));
        _bridgeToken = _configService.GetOrCreatePairingToken();
        _pdfCatalogService = new PdfCatalogService(_configService, _logService);
        _printJobService = new PrintJobService(_pdfCatalogService, _printerService, _devModeService, _logService);
        _devModeProfileService = new DevModeProfileService(_configService, _devModeService, _logService);
        _localApiServer = new LocalApiServer(
            _printerService,
            _devModeService,
            _driverPreferencesService,
            _pdfCatalogService,
            _printJobService,
            _devModeProfileService,
            _logService,
            _bridgeToken,
            AddPdfRootFromApiAsync,
            PerformUpdateAsync,
            GetUpdatePhase);

        Text = "INKORA Print Bridge";
        Width = 920;
        Height = 620;
        MinimumSize = new Size(760, 520);
        StartPosition = FormStartPosition.CenterScreen;
        BackColor = InkoraBg;

        BuildLayout();
        Load += (_, _) =>
        {
            StartLocalApi();
            RefreshPrinters();
            InitTrayIcon();
            if (_startedAfterUpdate)
            {
                ShowForm();
                _statusLabel.Text = "Bridge actualizado correctamente.";
                AppendDiagnostic("Actualizacion completada. El Bridge reinicio con la nueva version.");
            }
            else
            {
                HideToTray();
            }
        };
        FormClosing += (s, e) =>
        {
            if (!_allowClose)
            {
                e.Cancel = true;
                HideToTray();
            }
            else
            {
                _notifyIcon.Dispose();
                _localApiServer.Dispose();
            }
        };
    }

    private static Icon LoadInkoraIcon()
    {
        try
        {
            var asm = Assembly.GetExecutingAssembly();
            var stream = asm.GetManifestResourceStream("Inkora.PrintBridge.inkora.ico");
            if (stream is not null) return new Icon(stream);
        }
        catch { }
        return SystemIcons.Application;
    }

    private void InitTrayIcon()
    {
        var appIcon = LoadInkoraIcon();
        Icon = appIcon;

        var menu = new ContextMenuStrip();
        var showItem = (ToolStripMenuItem)menu.Items.Add("Mostrar panel");
        showItem.Click += (_, _) => ShowForm();
        menu.Items.Add(new ToolStripSeparator());
        var exitItem = (ToolStripMenuItem)menu.Items.Add("Salir");
        exitItem.Click += (_, _) => { _allowClose = true; Close(); };

        _notifyIcon.Icon = appIcon;
        _notifyIcon.Text = "INKORA Print Bridge";
        _notifyIcon.ContextMenuStrip = menu;
        _notifyIcon.MouseClick += (_, e) => { if (e.Button == MouseButtons.Left) ShowForm(); };
        _notifyIcon.Visible = true;
    }

    private void ShowForm()
    {
        Visible = true;
        ShowInTaskbar = true;
        WindowState = FormWindowState.Normal;
        Activate();
        BringToFront();
        if (IsHandleCreated) SetForegroundWindow(Handle);
    }

    private void HideToTray()
    {
        Visible = false;
        ShowInTaskbar = false;
    }

    private void BuildLayout()
    {
        var root = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 1,
            RowCount = 5,
            Padding = new Padding(16),
            BackColor = InkoraBg
        };
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 70));
        root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 160));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        root.RowStyles.Add(new RowStyle(SizeType.AutoSize));

        var header = new Panel { Dock = DockStyle.Fill, BackColor = InkoraBlue, Padding = new Padding(18, 10, 18, 10) };
        var headerTitle = new Label
        {
            Text = "INKORA Print Bridge",
            ForeColor = Color.White,
            Font = new Font("Segoe UI", 16, FontStyle.Bold),
            AutoSize = true,
            Location = new Point(18, 10)
        };
        var versionStr = Assembly.GetExecutingAssembly().GetName().Version?.ToString(3) ?? "dev";
        var headerVersion = new Label
        {
            Text = $"v{versionStr} - API local segura - Copias via SumatraPDF",
            ForeColor = Color.FromArgb(204, 222, 250),
            Font = new Font("Segoe UI", 9, FontStyle.Regular),
            AutoSize = true,
            Location = new Point(20, 42)
        };
        header.Controls.AddRange([headerTitle, headerVersion]);

        // Token + URL display row
        var tokenPanel = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            AutoSize = true,
            ColumnCount = 4,
            RowCount = 1,
            Padding = new Padding(0, 4, 0, 8),
            BackColor = InkoraBg,
            CellBorderStyle = TableLayoutPanelCellBorderStyle.None,
        };
        tokenPanel.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
        tokenPanel.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 440));
        tokenPanel.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
        tokenPanel.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));

        static Label MakeLabel(string text) => new()
        {
            Text = text, AutoSize = true,
            Font = new Font("Segoe UI", 10, FontStyle.Bold),
            ForeColor = InkoraBlueDark,
            Padding = new Padding(0, 5, 8, 0)
        };

        static TextBox MakeReadonlyBox(string text, int width) => new()
        {
            Text = text, ReadOnly = true, Width = width, Height = 28,
            Font = new Font(FontFamily.GenericMonospace, 10),
            BackColor = Color.White,
            BorderStyle = BorderStyle.FixedSingle
        };

        _tokenTextBox.Text = _bridgeToken;
        _tokenTextBox.ReadOnly = true;
        _tokenTextBox.Font = new Font(FontFamily.GenericMonospace, 10);
        _tokenTextBox.Width = 440;
        _tokenTextBox.Height = 28;
        _tokenTextBox.BackColor = Color.White;
        _tokenTextBox.BorderStyle = BorderStyle.FixedSingle;
        _tokenTextBox.Click += (_, _) => _tokenTextBox.SelectAll();

        // Network URL box — filled after Start()
        var networkUrlBox = MakeReadonlyBox("", 260);
        networkUrlBox.Click += (_, _) => networkUrlBox.SelectAll();
        // We'll update it after the API starts — store reference
        _networkUrlBox = networkUrlBox;

        tokenPanel.Controls.Add(MakeLabel("Token Bridge:"), 0, 0);
        tokenPanel.Controls.Add(_tokenTextBox, 1, 0);
        tokenPanel.Controls.Add(MakeLabel("   URL de red:"), 2, 0);
        tokenPanel.Controls.Add(networkUrlBox, 3, 0);

        ConfigurePrintersGrid();
        ConfigureDiagnosticTextBox();

        var actions = new FlowLayoutPanel
        {
            Dock = DockStyle.Fill,
            AutoSize = true,
            WrapContents = true,
            BackColor = InkoraBg
        };

        ConfigureButton(_refreshButton, "Actualizar", (_, _) => RefreshPrinters());
        ConfigureButton(_openPreferencesButton, "Abrir preferencias driver", (_, _) => OpenPrinterPreferences());
        ConfigureButton(_readDevModeButton, "Leer DEVMODE", (_, _) => ReadDevMode());
        ConfigureButton(_copyButton, "Copiar diagnostico", (_, _) => CopyDiagnostic());
        ConfigureButton(_openLogButton, "Abrir carpeta de logs", (_, _) => OpenLogFolder());
        ConfigureButton(_copyTokenButton, "Copiar token Bridge", (_, _) => CopyBridgeToken());
        ConfigureButton(_openHealthButton, "Abrir /health", (_, _) => OpenHealth());
        ConfigureButton(_addPdfRootButton, "Agregar carpeta PDFs", (_, _) => AddPdfRoot());
        ConfigureButton(_scanPdfsButton, "Escanear PDFs", (_, _) => ScanPdfs());

        var detenerButton = new Button
        {
            Text = "Detener Bridge",
            Height = 34,
            AutoSize = true,
            Margin = new Padding(24, 0, 8, 8),
            BackColor = ColorTranslator.FromHtml("#FFF5F5"),
            ForeColor = ColorTranslator.FromHtml("#b91c1c"),
            FlatStyle = FlatStyle.Flat,
        };
        detenerButton.FlatAppearance.BorderColor = ColorTranslator.FromHtml("#fca5a5");
        detenerButton.Click += (_, _) => { _allowClose = true; Close(); };

        actions.Controls.AddRange([
            _refreshButton,
            _openPreferencesButton,
            _readDevModeButton,
            _copyButton,
            _openLogButton,
            _copyTokenButton,
            _openHealthButton,
            _addPdfRootButton,
            _scanPdfsButton,
            detenerButton
        ]);

        _statusLabel.AutoSize = true;
        _statusLabel.Padding = new Padding(0, 8, 0, 0);
        _statusLabel.ForeColor = InkoraBlueDark;
        _statusLabel.Font = new Font("Segoe UI", 9, FontStyle.Bold);
        _apiLabel.AutoSize = true;
        _apiLabel.Padding = new Padding(0, 2, 0, 0);
        _apiLabel.ForeColor = ColorTranslator.FromHtml("#4D5F82");
        _pdfLabel.AutoSize = true;
        _pdfLabel.Padding = new Padding(0, 2, 0, 0);
        _pdfLabel.ForeColor = ColorTranslator.FromHtml("#4D5F82");

        var footer = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 1,
            RowCount = 4,
            AutoSize = true,
            BackColor = InkoraBg
        };
        footer.Controls.Add(actions, 0, 0);
        footer.Controls.Add(_statusLabel, 0, 1);
        footer.Controls.Add(_apiLabel, 0, 2);
        footer.Controls.Add(_pdfLabel, 0, 3);

        root.Controls.Add(header, 0, 0);
        root.Controls.Add(tokenPanel, 0, 1);
        root.Controls.Add(_printersGrid, 0, 2);
        root.Controls.Add(_diagnosticTextBox, 0, 3);
        root.Controls.Add(footer, 0, 4);

        Controls.Add(root);
    }

    private void ConfigurePrintersGrid()
    {
        _printersGrid.Dock = DockStyle.Fill;
        _printersGrid.ReadOnly = true;
        _printersGrid.AllowUserToAddRows = false;
        _printersGrid.AllowUserToDeleteRows = false;
        _printersGrid.AllowUserToResizeRows = false;
        _printersGrid.AutoGenerateColumns = false;
        _printersGrid.SelectionMode = DataGridViewSelectionMode.FullRowSelect;
        _printersGrid.MultiSelect = false;
        _printersGrid.RowHeadersVisible = false;
        _printersGrid.BackgroundColor = Color.White;
        _printersGrid.BorderStyle = BorderStyle.None;
        _printersGrid.GridColor = InkoraBorder;
        _printersGrid.EnableHeadersVisualStyles = false;
        _printersGrid.ColumnHeadersDefaultCellStyle.BackColor = InkoraBlue;
        _printersGrid.ColumnHeadersDefaultCellStyle.ForeColor = Color.White;
        _printersGrid.ColumnHeadersDefaultCellStyle.Font = new Font("Segoe UI", 9, FontStyle.Bold);
        _printersGrid.ColumnHeadersDefaultCellStyle.SelectionBackColor = InkoraBlue;
        _printersGrid.DefaultCellStyle.BackColor = Color.White;
        _printersGrid.DefaultCellStyle.ForeColor = InkoraBlueDark;
        _printersGrid.DefaultCellStyle.SelectionBackColor = InkoraBlueSoft;
        _printersGrid.DefaultCellStyle.SelectionForeColor = InkoraBlueDark;
        _printersGrid.AlternatingRowsDefaultCellStyle.BackColor = ColorTranslator.FromHtml("#FAFCFF");
        _printersGrid.AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill;

        _printersGrid.Columns.Add(new DataGridViewTextBoxColumn
        {
            HeaderText = "Impresora",
            DataPropertyName = nameof(PrinterInfo.Name),
            FillWeight = 180
        });
        _printersGrid.Columns.Add(new DataGridViewCheckBoxColumn
        {
            HeaderText = "Default",
            DataPropertyName = nameof(PrinterInfo.IsDefault),
            FillWeight = 55
        });
        _printersGrid.Columns.Add(new DataGridViewCheckBoxColumn
        {
            HeaderText = "L8050",
            DataPropertyName = nameof(PrinterInfo.IsTargetL8050),
            FillWeight = 55
        });
        _printersGrid.Columns.Add(new DataGridViewTextBoxColumn
        {
            HeaderText = "Estado",
            DataPropertyName = nameof(PrinterInfo.StatusText),
            FillWeight = 120
        });
        _printersGrid.Columns.Add(new DataGridViewTextBoxColumn
        {
            HeaderText = "Driver",
            DataPropertyName = nameof(PrinterInfo.DriverName),
            FillWeight = 140
        });
        _printersGrid.Columns.Add(new DataGridViewTextBoxColumn
        {
            HeaderText = "Puerto",
            DataPropertyName = nameof(PrinterInfo.PortName),
            FillWeight = 90
        });
        _printersGrid.Columns.Add(new DataGridViewTextBoxColumn
        {
            HeaderText = "Jobs",
            DataPropertyName = nameof(PrinterInfo.JobCount),
            FillWeight = 45
        });
    }

    private void ConfigureDiagnosticTextBox()
    {
        _diagnosticTextBox.Dock = DockStyle.Fill;
        _diagnosticTextBox.Multiline = true;
        _diagnosticTextBox.ReadOnly = true;
        _diagnosticTextBox.ScrollBars = ScrollBars.Both;
        _diagnosticTextBox.WordWrap = false;
        _diagnosticTextBox.Font = new Font(FontFamily.GenericMonospace, 9);
        _diagnosticTextBox.BackColor = ColorTranslator.FromHtml("#FDFEFF");
        _diagnosticTextBox.ForeColor = InkoraBlueDark;
        _diagnosticTextBox.BorderStyle = BorderStyle.FixedSingle;
    }

    private static void ConfigureButton(Button button, string text, EventHandler clickHandler)
    {
        button.Text = text;
        button.AutoSize = true;
        button.Height = 34;
        button.Margin = new Padding(0, 0, 8, 8);
        button.FlatStyle = FlatStyle.Flat;
        button.BackColor = Color.White;
        button.ForeColor = InkoraBlue;
        button.Font = new Font("Segoe UI", 9, FontStyle.Bold);
        button.FlatAppearance.BorderColor = InkoraBorder;
        button.FlatAppearance.MouseOverBackColor = InkoraBlueSoft;
        button.Click += clickHandler;
    }

    private void StartLocalApi()
    {
        _localApiServer.Start();

        if (_localApiServer.IsRunning)
        {
            var networkUrl = _localApiServer.NetworkUrl;
            if (_networkUrlBox is not null) _networkUrlBox.Text = networkUrl;
            _apiLabel.Text = $"API local: {_localApiServer.LoopbackUrl} | Red: {networkUrl} | Config: {_configService.ConfigRoot}";
            AppendDiagnostic($"API iniciada en {_localApiServer.LoopbackUrl} (red: {networkUrl}). /printers requiere token Bridge.");
        }
        else
        {
            _apiLabel.Text = $"API local no disponible: {_localApiServer.LastError}";
            AppendDiagnostic($"ERROR iniciando API local: {_localApiServer.LastError}");
        }
    }

    private void AddPdfRoot()
    {
        try
        {
            var rootCount = _pdfCatalogService.AddRootFromDialog(this);
            _pdfLabel.Text = $"Carpetas PDF autorizadas: {rootCount}. Ejecuta Escanear PDFs para actualizar.";
            AppendDiagnostic($"Carpetas PDF autorizadas: {rootCount}");
        }
        catch (Exception exception)
        {
            AppendDiagnostic($"ERROR agregando carpeta PDF: {exception.Message}");
            _logService.Error(exception.ToString());
        }
    }

    private Task<IReadOnlyList<PdfRootInfo>> AddPdfRootFromApiAsync()
    {
        var completion = new TaskCompletionSource<IReadOnlyList<PdfRootInfo>>();

        void RunDialog()
        {
            var wasVisible = Visible;
            try
            {
                if (!wasVisible)
                {
                    ShowForm();
                    Application.DoEvents();
                }
                var rootCount = _pdfCatalogService.AddRootFromDialog(this);
                var roots = _pdfCatalogService.GetRoots();
                _pdfLabel.Text = $"Carpetas PDF autorizadas: {rootCount}. Ejecuta Escanear PDFs para actualizar.";
                AppendDiagnostic($"Carpetas PDF autorizadas desde admin web: {rootCount}");
                completion.SetResult(roots);
            }
            catch (Exception exception)
            {
                AppendDiagnostic($"ERROR agregando carpeta PDF desde admin web: {exception.Message}");
                _logService.Error(exception.ToString());
                completion.SetException(exception);
            }
            finally
            {
                if (!wasVisible) HideToTray();
            }
        }

        if (IsHandleCreated)
        {
            BeginInvoke((Action)RunDialog);
        }
        else
        {
            RunDialog();
        }

        return completion.Task;
    }

    private void ScanPdfs()
    {
        try
        {
            var pdfs = _pdfCatalogService.Scan();
            var roots = _pdfCatalogService.GetRoots();
            _pdfLabel.Text = $"PDFs: {pdfs.Count} en {roots.Count} carpeta(s) autorizada(s).";
            AppendDiagnostic(BuildPdfSummary(roots, pdfs));
            _logService.Info($"PDFs escaneados desde UI. Total={pdfs.Count}.");
        }
        catch (Exception exception)
        {
            AppendDiagnostic($"ERROR escaneando PDFs: {exception.Message}");
            _logService.Error(exception.ToString());
        }
    }

    private void RefreshPrinters()
    {
        try
        {
            var printers = _printerService.GetInstalledPrinters();
            _printers = new BindingList<PrinterInfo>(printers.ToList());
            _printersGrid.DataSource = _printers;

            var target = printers.FirstOrDefault(printer => printer.IsTargetL8050);
            var defaultPrinter = printers.FirstOrDefault(printer => printer.IsDefault);
            var status = target is null
                ? "No se detecto Epson L8050 por nombre. Selecciona una impresora manualmente."
                : $"Detectada Epson candidata: {target.Name}";
            var printEngine = _printJobService.SumatraPdfPath is not null
                ? "Motor PDF: SumatraPDF"
                : "Motor PDF: fallback solo 1 copia";

            _statusLabel.Text = $"{status} | {printEngine} | Default: {defaultPrinter?.Name ?? "sin default"} | Log: {_logService.LogFilePath}";

            AppendDiagnostic(BuildPrinterSummary(printers));
            _logService.Info($"Impresoras actualizadas. Total={printers.Count}. Target={target?.Name ?? "no detectada"}.");
        }
        catch (Exception exception)
        {
            AppendDiagnostic($"ERROR actualizando impresoras: {exception.Message}");
            _logService.Error(exception.ToString());
        }
    }

    private void OpenPrinterPreferences()
    {
        var printer = GetSelectedOrPreferredPrinter();
        if (printer is null)
        {
            AppendDiagnostic("No hay impresora para abrir preferencias.");
            return;
        }

        try
        {
            _driverPreferencesService.OpenPrinterPreferences(printer.Name);
            AppendDiagnostic($"Preferencias abiertas para: {printer.Name}");
            _logService.Info($"Preferencias abiertas para {printer.Name}.");
        }
        catch (Exception exception)
        {
            AppendDiagnostic($"ERROR abriendo preferencias: {exception.Message}");
            _logService.Error(exception.ToString());
        }
    }

    private void ReadDevMode()
    {
        var printer = GetSelectedOrPreferredPrinter();
        if (printer is null)
        {
            AppendDiagnostic("No hay impresora para leer DEVMODE.");
            return;
        }

        var diagnostic = _devModeService.ReadDefaultDevMode(printer.Name);
        AppendDiagnostic(FormatDevModeDiagnostic(diagnostic));

        if (diagnostic.IsSuccess)
        {
            _logService.Info($"DEVMODE leido para {printer.Name}. Size={diagnostic.QuerySize}, Extra={diagnostic.DriverExtra}.");
        }
        else
        {
            _logService.Error($"DEVMODE fallo para {printer.Name}. Error={diagnostic.Error}");
        }
    }

    private void CopyDiagnostic()
    {
        if (string.IsNullOrWhiteSpace(_diagnosticTextBox.Text))
        {
            return;
        }

        Clipboard.SetText(_diagnosticTextBox.Text);
        _statusLabel.Text = "Diagnostico copiado al portapapeles.";
    }

    private void CopyBridgeToken()
    {
        Clipboard.SetText(_bridgeToken);
        _statusLabel.Text = $"Token Bridge copiado. Preview: {GetTokenPreview(_bridgeToken)}";
    }

    private void OpenHealth()
    {
        System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo
        {
            FileName = _localApiServer.HealthUrl,
            UseShellExecute = true
        });
    }

    private void OpenLogFolder()
    {
        var directory = Path.GetDirectoryName(_logService.LogFilePath);
        if (directory is null)
        {
            return;
        }

        System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo
        {
            FileName = directory,
            UseShellExecute = true
        });
    }

    private PrinterInfo? GetSelectedOrPreferredPrinter()
    {
        if (_printersGrid.CurrentRow?.DataBoundItem is PrinterInfo selected)
        {
            return selected;
        }

        return _printers.FirstOrDefault(printer => printer.IsTargetL8050)
            ?? _printers.FirstOrDefault(printer => printer.IsDefault)
            ?? _printers.FirstOrDefault();
    }

    private void AppendDiagnostic(string text)
    {
        if (_diagnosticTextBox.TextLength > 0)
        {
            _diagnosticTextBox.AppendText(Environment.NewLine + Environment.NewLine);
        }

        _diagnosticTextBox.AppendText($"[{DateTimeOffset.Now:HH:mm:ss}] {text}");
    }

    private static string GetTokenPreview(string token)
    {
        if (token.Length <= 10)
        {
            return token;
        }

        return $"{token[..4]}...{token[^6..]}";
    }

    private static string BuildPrinterSummary(IEnumerable<PrinterInfo> printers)
    {
        var builder = new StringBuilder();
        builder.AppendLine("Impresoras detectadas:");

        foreach (var printer in printers)
        {
            builder.AppendLine($"- {printer.Name}");
            builder.AppendLine($"  Default: {printer.IsDefault}");
            builder.AppendLine($"  L8050 candidata: {printer.IsTargetL8050}");
            builder.AppendLine($"  Estado: {printer.StatusText} (0x{printer.StatusCode:X8})");
            builder.AppendLine($"  Driver: {printer.DriverName}");
            builder.AppendLine($"  Puerto: {printer.PortName}");
            builder.AppendLine($"  Jobs: {printer.JobCount}");
            if (!string.IsNullOrWhiteSpace(printer.Error))
            {
                builder.AppendLine($"  Error spooler: {printer.Error}");
            }
        }

        return builder.ToString().TrimEnd();
    }

    private static string FormatDevModeDiagnostic(DevModeDiagnostic diagnostic)
    {
        var builder = new StringBuilder();
        builder.AppendLine($"DEVMODE: {diagnostic.PrinterName}");
        builder.AppendLine($"  Exito: {diagnostic.IsSuccess}");
        builder.AppendLine($"  QuerySize: {diagnostic.QuerySize}");
        builder.AppendLine($"  ResultCode: {diagnostic.ResultCode}");

        if (!string.IsNullOrWhiteSpace(diagnostic.Error))
        {
            builder.AppendLine($"  Error: {diagnostic.Error}");
        }

        builder.AppendLine($"  DeviceName: {diagnostic.DeviceName}");
        builder.AppendLine($"  SpecVersion: {diagnostic.SpecVersion}");
        builder.AppendLine($"  DriverVersion: {diagnostic.DriverVersion}");
        builder.AppendLine($"  PublicSize: {diagnostic.PublicSize}");
        builder.AppendLine($"  DriverExtra: {diagnostic.DriverExtra}");
        builder.AppendLine($"  Fields: {diagnostic.FieldsHex}");
        builder.AppendLine($"  HeaderHex: {diagnostic.HeaderHex}");

        return builder.ToString().TrimEnd();
    }

    private string GetUpdatePhase() => _updatePhase;

    private void ReportUpdateStatus(string message)
    {
        _logService.Info($"[UPDATE] {message}");
        try
        {
            if (!IsHandleCreated) return;
            BeginInvoke((Action)(() =>
            {
                ShowForm();
                _statusLabel.Text = message;
                AppendDiagnostic($"[UPDATE] {message}");
            }));
        }
        catch
        {
            // UI feedback is best-effort; logs still carry the update trail.
        }
    }

    private async Task PerformUpdateAsync(string downloadUrl)
    {
        _logService.Info($"[UPDATE] Iniciado desde: {downloadUrl}");
        try
        {
            _updatePhase = "downloading";
            ReportUpdateStatus("Descargando actualizacion del Bridge...");

            var tempDir = Path.Combine(Path.GetTempPath(), $"inkora_bridge_upd_{Environment.ProcessId}");
            if (Directory.Exists(tempDir)) Directory.Delete(tempDir, true);
            Directory.CreateDirectory(tempDir);
            var payloadDir = Path.Combine(tempDir, "payload");
            Directory.CreateDirectory(payloadDir);

            using var http = new HttpClient { Timeout = TimeSpan.FromMinutes(8) };
            var bytes = await http.GetByteArrayAsync(downloadUrl);
            var zipPath = Path.Combine(tempDir, "update.zip");
            await File.WriteAllBytesAsync(zipPath, bytes);

            _updatePhase = "extracting";
            ReportUpdateStatus("Extrayendo paquete de actualizacion...");

            using (var zip = ZipFile.OpenRead(zipPath))
            {
                foreach (var entry in zip.Entries)
                {
                    if (string.IsNullOrWhiteSpace(entry.Name)) continue;

                    var cleanName = entry.FullName.Replace('\\', '/');
                    var parts = cleanName.Split('/', StringSplitOptions.RemoveEmptyEntries).ToList();
                    if (parts.Count > 1 && string.Equals(parts[0], "Inkora PrintBridge", StringComparison.OrdinalIgnoreCase))
                    {
                        parts.RemoveAt(0);
                    }

                    if (parts.Count == 0 || parts.Any(part => part == ".." || part.IndexOfAny(Path.GetInvalidFileNameChars()) >= 0))
                    {
                        continue;
                    }

                    var destination = Path.Combine(payloadDir, Path.Combine(parts.ToArray()));
                    var destinationRoot = Path.GetFullPath(payloadDir);
                    var destinationFull = Path.GetFullPath(destination);
                    if (!destinationFull.StartsWith(destinationRoot, StringComparison.OrdinalIgnoreCase))
                    {
                        continue;
                    }

                    Directory.CreateDirectory(Path.GetDirectoryName(destinationFull)!);
                    entry.ExtractToFile(destinationFull, overwrite: true);
                }
            }

            _updatePhase = "replacing";
            ReportUpdateStatus("Preparando reemplazo de archivos...");

            var currentExe = System.Diagnostics.Process.GetCurrentProcess().MainModule?.FileName
                ?? throw new Exception("No se pudo determinar la ruta del ejecutable actual.");
            var installDir = Path.GetDirectoryName(currentExe)
                ?? throw new Exception("No se pudo determinar la carpeta instalada.");
            var newExe = Directory.GetFiles(payloadDir, "Inkora.PrintBridge.exe", SearchOption.AllDirectories).FirstOrDefault()
                ?? throw new Exception("No se encontro Inkora.PrintBridge.exe en el ZIP.");
            var payloadRoot = Path.GetDirectoryName(newExe)
                ?? throw new Exception("No se pudo preparar el paquete de actualizacion.");

            if (!File.Exists(Path.Combine(payloadRoot, "SumatraPDF.exe")))
            {
                ReportUpdateStatus("Advertencia: el paquete no incluye SumatraPDF.exe; las copias multiples no seran confiables.");
            }

            var batPath = Path.Combine(tempDir, "do_update.bat");
            var pid = System.Diagnostics.Process.GetCurrentProcess().Id;

            // Wait for THIS process (by PID) to fully exit before copying locked files.
            await File.WriteAllTextAsync(batPath,
                "@echo off\r\n" +
                "setlocal\r\n" +
                $"set \"PAYLOAD={payloadRoot}\"\r\n" +
                $"set \"TARGET={installDir}\"\r\n" +
                $":waitpid\r\n" +
                $"tasklist /fi \"pid eq {pid}\" 2>NUL | find /I \"Inkora\" >NUL\r\n" +
                $"if not errorlevel 1 (timeout /t 1 /nobreak >nul & goto waitpid)\r\n" +
                "robocopy \"%PAYLOAD%\" \"%TARGET%\" /E /NFL /NDL /NJH /NJS /NC /NS /NP\r\n" +
                "set \"RC=%ERRORLEVEL%\"\r\n" +
                "if %RC% GEQ 8 exit /b %RC%\r\n" +
                $"start \"\" \"{currentExe}\" --updated\r\n" +
                $"del \"%~f0\"\r\n",
                Encoding.ASCII);

            _logService.Info($"[UPDATE] Script listo (PID={pid}). Cerrando...");
            ReportUpdateStatus("Instalando actualizacion y reiniciando Bridge...");

            System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo
            {
                FileName = "cmd.exe",
                Arguments = $"/c \"{batPath}\"",
                WindowStyle = System.Diagnostics.ProcessWindowStyle.Hidden,
                CreateNoWindow = true,
                UseShellExecute = true,
            });

            try { BeginInvoke((Action)(() => { _allowClose = true; Application.Exit(); })); }
            catch { _allowClose = true; Application.Exit(); }
        }
        catch (Exception ex)
        {
            _updatePhase = "idle";
            _logService.Error($"[UPDATE] Error: {ex}");
            try { BeginInvoke((Action)(() => AppendDiagnostic($"[UPDATE ERROR] {ex.Message}"))); }
            catch { }
        }
    }

    private static string BuildPdfSummary(IReadOnlyList<PdfRootInfo> roots, IReadOnlyList<PdfFileInfo> pdfs)
    {
        var builder = new StringBuilder();
        builder.AppendLine($"PDFs detectados: {pdfs.Count}");
        builder.AppendLine("Carpetas autorizadas:");
        foreach (var root in roots)
        {
            builder.AppendLine($"- {root.Name}: {(root.Exists ? "OK" : "No existe")} - {root.Path}");
        }

        foreach (var pdf in pdfs.Take(20))
        {
            builder.AppendLine($"- {pdf.RootName}\\{pdf.RelativePath}");
        }

        if (pdfs.Count > 20)
        {
            builder.AppendLine($"... y {pdfs.Count - 20} mas");
        }

        return builder.ToString().TrimEnd();
    }
}
