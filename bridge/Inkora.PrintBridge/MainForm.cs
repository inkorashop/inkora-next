using System.ComponentModel;
using System.Reflection;
using System.Text;
using Inkora.PrintBridge.Models;
using Inkora.PrintBridge.Services;

namespace Inkora.PrintBridge;

public sealed class MainForm : Form
{
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

    private readonly DataGridView _printersGrid = new();
    private readonly TextBox _diagnosticTextBox = new();
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

    public MainForm()
    {
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
            AddPdfRootFromApiAsync);

        Text = "INKORA Print Bridge - Diagnostico";
        Width = 1120;
        Height = 760;
        MinimumSize = new Size(920, 620);
        StartPosition = FormStartPosition.CenterScreen;

        BuildLayout();
        Load += (_, _) =>
        {
            StartLocalApi();
            RefreshPrinters();
            InitTrayIcon();
            HideToTray();
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
        _notifyIcon.DoubleClick += (_, _) => ShowForm();
        _notifyIcon.Visible = true;
    }

    private void ShowForm()
    {
        Visible = true;
        ShowInTaskbar = true;
        WindowState = FormWindowState.Normal;
        Activate();
        BringToFront();
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
            RowCount = 4,
            Padding = new Padding(12)
        };
        root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 300));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        root.RowStyles.Add(new RowStyle(SizeType.AutoSize));

        var title = new Label
        {
            Text = "INKORA Print Bridge - Prototipo diagnostico local",
            Dock = DockStyle.Fill,
            Font = new Font(Font.FontFamily, 14, FontStyle.Bold),
            Height = 34
        };

        ConfigurePrintersGrid();
        ConfigureDiagnosticTextBox();

        var actions = new FlowLayoutPanel
        {
            Dock = DockStyle.Fill,
            AutoSize = true,
            WrapContents = true
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

        actions.Controls.AddRange([
            _refreshButton,
            _openPreferencesButton,
            _readDevModeButton,
            _copyButton,
            _openLogButton,
            _copyTokenButton,
            _openHealthButton,
            _addPdfRootButton,
            _scanPdfsButton
        ]);

        _statusLabel.AutoSize = true;
        _statusLabel.Padding = new Padding(0, 8, 0, 0);
        _apiLabel.AutoSize = true;
        _apiLabel.Padding = new Padding(0, 2, 0, 0);
        _pdfLabel.AutoSize = true;
        _pdfLabel.Padding = new Padding(0, 2, 0, 0);

        var footer = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 1,
            RowCount = 4,
            AutoSize = true
        };
        footer.Controls.Add(actions, 0, 0);
        footer.Controls.Add(_statusLabel, 0, 1);
        footer.Controls.Add(_apiLabel, 0, 2);
        footer.Controls.Add(_pdfLabel, 0, 3);

        root.Controls.Add(title, 0, 0);
        root.Controls.Add(_printersGrid, 0, 1);
        root.Controls.Add(_diagnosticTextBox, 0, 2);
        root.Controls.Add(footer, 0, 3);

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
    }

    private static void ConfigureButton(Button button, string text, EventHandler clickHandler)
    {
        button.Text = text;
        button.AutoSize = true;
        button.Height = 34;
        button.Margin = new Padding(0, 0, 8, 8);
        button.Click += clickHandler;
    }

    private void StartLocalApi()
    {
        _localApiServer.Start();

        if (_localApiServer.IsRunning)
        {
            _apiLabel.Text = $"API local: {_localApiServer.Url} | Token: {GetTokenPreview(_bridgeToken)} | Config: {_configService.ConfigRoot}";
            AppendDiagnostic($"API local iniciada: {_localApiServer.Url}. /printers requiere token Bridge.");
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
                if (!wasVisible) ShowForm();
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

            _statusLabel.Text = $"{status} | Default: {defaultPrinter?.Name ?? "sin default"} | Log: {_logService.LogFilePath}";

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
