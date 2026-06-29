Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Data

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public static class InkoraDevModePreview
{
    private const int DM_OUT_BUFFER = 2;

    [DllImport("winspool.drv", SetLastError = true, CharSet = CharSet.Auto)]
    private static extern bool OpenPrinter(string pPrinterName, out IntPtr phPrinter, IntPtr pDefault);

    [DllImport("winspool.drv", SetLastError = true)]
    private static extern bool ClosePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", SetLastError = true, CharSet = CharSet.Auto)]
    private static extern int DocumentProperties(
        IntPtr hwnd,
        IntPtr hPrinter,
        string pDeviceName,
        IntPtr pDevModeOutput,
        IntPtr pDevModeInput,
        int fMode);

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Auto)]
    private struct DevModeHeader
    {
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)]
        public string DeviceName;

        public ushort SpecVersion;
        public ushort DriverVersion;
        public ushort Size;
        public ushort DriverExtra;
        public uint Fields;
    }

    public static string Read(string printerName)
    {
        if (String.IsNullOrWhiteSpace(printerName))
        {
            return "No hay impresora seleccionada.";
        }

        IntPtr printerHandle;
        if (!OpenPrinter(printerName, out printerHandle, IntPtr.Zero))
        {
            return "OpenPrinter fallo. Win32=" + Marshal.GetLastWin32Error();
        }

        try
        {
            int size = DocumentProperties(IntPtr.Zero, printerHandle, printerName, IntPtr.Zero, IntPtr.Zero, 0);
            if (size <= 0)
            {
                return "DocumentProperties no devolvio tamano valido. Size=" + size + " Win32=" + Marshal.GetLastWin32Error();
            }

            IntPtr buffer = Marshal.AllocHGlobal(size);
            try
            {
                int result = DocumentProperties(IntPtr.Zero, printerHandle, printerName, buffer, IntPtr.Zero, DM_OUT_BUFFER);
                if (result <= 0)
                {
                    return "DocumentProperties fallo al leer DEVMODE. Result=" + result + " Win32=" + Marshal.GetLastWin32Error();
                }

                DevModeHeader header = (DevModeHeader)Marshal.PtrToStructure(buffer, typeof(DevModeHeader));
                return
                    "DEVMODE: " + printerName + Environment.NewLine +
                    "  ResultCode: " + result + Environment.NewLine +
                    "  QuerySize: " + size + Environment.NewLine +
                    "  DeviceName: " + header.DeviceName + Environment.NewLine +
                    "  SpecVersion: " + header.SpecVersion + Environment.NewLine +
                    "  DriverVersion: " + header.DriverVersion + Environment.NewLine +
                    "  PublicSize: " + header.Size + Environment.NewLine +
                    "  DriverExtra: " + header.DriverExtra + Environment.NewLine +
                    "  Fields: 0x" + header.Fields.ToString("X8");
            }
            finally
            {
                Marshal.FreeHGlobal(buffer);
            }
        }
        finally
        {
            ClosePrinter(printerHandle);
        }
    }
}
"@

$preferredLogRoot = Join-Path $env:LOCALAPPDATA "INKORA\PrintBridge\logs"
$logRoot = $preferredLogRoot
try {
    New-Item -ItemType Directory -Force -Path $logRoot -ErrorAction Stop | Out-Null
} catch {
    $logRoot = Join-Path $PSScriptRoot "diagnostic-logs"
    New-Item -ItemType Directory -Force -Path $logRoot | Out-Null
}
$logPath = Join-Path $logRoot "bridge-diagnostic-preview.log"

function Write-InkoraLog {
    param([string]$Message)
    try {
        Add-Content -Path $logPath -Value ("{0} {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message)
    } catch {}
}

function Get-InkoraPrinterRows {
    $defaultPrinter = ""
    try {
        $settings = New-Object System.Drawing.Printing.PrinterSettings
        if ($settings.IsValid) {
            $defaultPrinter = $settings.PrinterName
        }
    } catch {}

    $wmiByName = @{}
    try {
        Get-CimInstance -ClassName Win32_Printer -ErrorAction Stop | ForEach-Object {
            $wmiByName[[string]$_.Name] = $_
        }
    } catch {
        Write-InkoraLog ("Get-CimInstance Win32_Printer fallo: " + $_.Exception.Message)
    }

    $rows = @()
    foreach ($printerName in [System.Drawing.Printing.PrinterSettings]::InstalledPrinters) {
        $wmi = $wmiByName[[string]$printerName]
        $rows += [pscustomobject]@{
            Impresora = [string]$printerName
            Default = ([string]$printerName -ieq $defaultPrinter)
            L8050 = ([string]$printerName -like "*L8050*")
            Estado = if ($wmi) { "Status=$($wmi.PrinterStatus) State=$($wmi.PrinterState)" } else { "No disponible" }
            Driver = if ($wmi) { [string]$wmi.DriverName } else { "" }
            Puerto = if ($wmi) { [string]$wmi.PortName } else { "" }
            Jobs = if ($wmi) { [string]$wmi.JobCountSinceLastReset } else { "" }
        }
    }

    return $rows | Sort-Object -Property @{ Expression = "L8050"; Descending = $true }, @{ Expression = "Default"; Descending = $true }, Impresora
}

function ConvertTo-PrinterTable {
    param($Rows)

    $table = New-Object System.Data.DataTable
    [void]$table.Columns.Add("Impresora", [string])
    [void]$table.Columns.Add("Default", [bool])
    [void]$table.Columns.Add("L8050", [bool])
    [void]$table.Columns.Add("Estado", [string])
    [void]$table.Columns.Add("Driver", [string])
    [void]$table.Columns.Add("Puerto", [string])
    [void]$table.Columns.Add("Jobs", [string])

    foreach ($item in $Rows) {
        $row = $table.NewRow()
        $row["Impresora"] = $item.Impresora
        $row["Default"] = $item.Default
        $row["L8050"] = $item.L8050
        $row["Estado"] = $item.Estado
        $row["Driver"] = $item.Driver
        $row["Puerto"] = $item.Puerto
        $row["Jobs"] = $item.Jobs
        [void]$table.Rows.Add($row)
    }

    return $table
}

function Add-DiagnosticText {
    param([string]$Text)
    $diagnosticBox.AppendText(("[{0}] {1}{2}{2}" -f (Get-Date -Format "HH:mm:ss"), $Text, [Environment]::NewLine))
    Write-InkoraLog $Text
}

function Get-SelectedPrinterName {
    if ($grid.CurrentRow -and $grid.CurrentRow.Cells["Impresora"].Value) {
        return [string]$grid.CurrentRow.Cells["Impresora"].Value
    }

    foreach ($row in $grid.Rows) {
        if ($row.Cells["L8050"].Value -eq $true) {
            return [string]$row.Cells["Impresora"].Value
        }
    }

    if ($grid.Rows.Count -gt 0) {
        return [string]$grid.Rows[0].Cells["Impresora"].Value
    }

    return ""
}

$form = New-Object System.Windows.Forms.Form
$form.Text = "INKORA Print Bridge - Preview diagnostico"
$form.Width = 1120
$form.Height = 760
$form.StartPosition = "CenterScreen"

$root = New-Object System.Windows.Forms.TableLayoutPanel
$root.Dock = "Fill"
$root.ColumnCount = 1
$root.RowCount = 4
$root.Padding = New-Object System.Windows.Forms.Padding(12)
$root.RowStyles.Add((New-Object System.Windows.Forms.RowStyle([System.Windows.Forms.SizeType]::AutoSize))) | Out-Null
$root.RowStyles.Add((New-Object System.Windows.Forms.RowStyle([System.Windows.Forms.SizeType]::Absolute, 300))) | Out-Null
$root.RowStyles.Add((New-Object System.Windows.Forms.RowStyle([System.Windows.Forms.SizeType]::Percent, 100))) | Out-Null
$root.RowStyles.Add((New-Object System.Windows.Forms.RowStyle([System.Windows.Forms.SizeType]::AutoSize))) | Out-Null

$title = New-Object System.Windows.Forms.Label
$title.Text = "INKORA Print Bridge - Preview diagnostico local"
$title.Dock = "Fill"
$title.Height = 34
$title.Font = New-Object System.Drawing.Font($title.Font.FontFamily, 14, [System.Drawing.FontStyle]::Bold)

$grid = New-Object System.Windows.Forms.DataGridView
$grid.Dock = "Fill"
$grid.ReadOnly = $true
$grid.AllowUserToAddRows = $false
$grid.AllowUserToDeleteRows = $false
$grid.RowHeadersVisible = $false
$grid.SelectionMode = "FullRowSelect"
$grid.MultiSelect = $false
$grid.AutoSizeColumnsMode = "Fill"

$diagnosticBox = New-Object System.Windows.Forms.TextBox
$diagnosticBox.Dock = "Fill"
$diagnosticBox.Multiline = $true
$diagnosticBox.ReadOnly = $true
$diagnosticBox.ScrollBars = "Both"
$diagnosticBox.WordWrap = $false
$diagnosticBox.Font = New-Object System.Drawing.Font([System.Drawing.FontFamily]::GenericMonospace, 9)

$actions = New-Object System.Windows.Forms.FlowLayoutPanel
$actions.Dock = "Fill"
$actions.AutoSize = $true

$refreshButton = New-Object System.Windows.Forms.Button
$refreshButton.Text = "Actualizar"
$refreshButton.AutoSize = $true
$refreshButton.Add_Click({
    $rows = Get-InkoraPrinterRows
    $grid.DataSource = ConvertTo-PrinterTable $rows
    $target = $rows | Where-Object { $_.L8050 } | Select-Object -First 1
    if ($target) {
        $statusLabel.Text = "Detectada Epson candidata: $($target.Impresora) | Log: $logPath"
    } else {
        $statusLabel.Text = "No se detecto Epson L8050 por nombre | Log: $logPath"
    }
    Add-DiagnosticText ("Impresoras actualizadas. Total=" + @($rows).Count)
})

$prefsButton = New-Object System.Windows.Forms.Button
$prefsButton.Text = "Abrir preferencias driver"
$prefsButton.AutoSize = $true
$prefsButton.Add_Click({
    $printerName = Get-SelectedPrinterName
    if ([string]::IsNullOrWhiteSpace($printerName)) {
        Add-DiagnosticText "No hay impresora seleccionada."
        return
    }

    Start-Process -FilePath "rundll32.exe" -ArgumentList ("printui.dll,PrintUIEntry /e /n `"{0}`"" -f ($printerName -replace '"', ''))
    Add-DiagnosticText "Preferencias abiertas para: $printerName"
})

$devModeButton = New-Object System.Windows.Forms.Button
$devModeButton.Text = "Leer DEVMODE"
$devModeButton.AutoSize = $true
$devModeButton.Add_Click({
    $printerName = Get-SelectedPrinterName
    $result = [InkoraDevModePreview]::Read($printerName)
    Add-DiagnosticText $result
})

$copyButton = New-Object System.Windows.Forms.Button
$copyButton.Text = "Copiar diagnostico"
$copyButton.AutoSize = $true
$copyButton.Add_Click({
    if (-not [string]::IsNullOrWhiteSpace($diagnosticBox.Text)) {
        [System.Windows.Forms.Clipboard]::SetText($diagnosticBox.Text)
        $statusLabel.Text = "Diagnostico copiado al portapapeles."
    }
})

$logButton = New-Object System.Windows.Forms.Button
$logButton.Text = "Abrir logs"
$logButton.AutoSize = $true
$logButton.Add_Click({
    Start-Process -FilePath $logRoot
})

$actions.Controls.AddRange(@($refreshButton, $prefsButton, $devModeButton, $copyButton, $logButton))

$statusLabel = New-Object System.Windows.Forms.Label
$statusLabel.AutoSize = $true
$statusLabel.Padding = New-Object System.Windows.Forms.Padding(0, 8, 0, 0)
$statusLabel.Text = "Listo. Log: $logPath"

$footer = New-Object System.Windows.Forms.TableLayoutPanel
$footer.Dock = "Fill"
$footer.ColumnCount = 1
$footer.RowCount = 2
$footer.AutoSize = $true
$footer.Controls.Add($actions, 0, 0)
$footer.Controls.Add($statusLabel, 0, 1)

$root.Controls.Add($title, 0, 0)
$root.Controls.Add($grid, 0, 1)
$root.Controls.Add($diagnosticBox, 0, 2)
$root.Controls.Add($footer, 0, 3)
$form.Controls.Add($root)

$form.Add_Shown({
    $refreshButton.PerformClick()
})

Write-InkoraLog "Preview diagnostico iniciado."
[void]$form.ShowDialog()
