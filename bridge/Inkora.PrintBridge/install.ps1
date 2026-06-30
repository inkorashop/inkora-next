# INKORA Print Bridge - Instalador
# Ejecutar con doble clic en install.bat (se auto-eleva a administrador)

param([switch]$Elevated)

# Auto-elevar a admin si es necesario
if (-not $Elevated) {
    $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    if (-not $isAdmin) {
        Start-Process powershell -Verb RunAs -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`" -Elevated" -Wait
        exit
    }
}

$scriptDir  = Split-Path -Parent $PSCommandPath
$projectPath = Join-Path $scriptDir "Inkora.PrintBridge.csproj"
$publishPath = Join-Path $scriptDir "bin\Published"
$exePath     = Join-Path $publishPath "Inkora.PrintBridge.exe"

Write-Host ""
Write-Host "=== INKORA Print Bridge - Instalacion ===" -ForegroundColor Cyan
Write-Host ""

# Detener el Bridge si esta corriendo (sino el .exe/.dll quedan bloqueados y falla la compilacion)
$running = Get-Process -Name "Inkora.PrintBridge" -ErrorAction SilentlyContinue
if ($running) {
    Write-Host "Deteniendo Bridge en ejecucion..." -ForegroundColor Yellow
    $running | Stop-Process -Force
    Start-Sleep -Seconds 1
    Write-Host "Bridge detenido OK" -ForegroundColor Green
}

# Buscar dotnet
$dotnetExe = $null
$candidates = @(
    (Join-Path $env:ProgramFiles "dotnet\dotnet.exe"),
    (Join-Path ${env:ProgramFiles(x86)} "dotnet\dotnet.exe"),
    (Join-Path $env:USERPROFILE ".dotnet\dotnet.exe")
)
foreach ($c in $candidates) { if (Test-Path $c) { $dotnetExe = $c; break } }
if (-not $dotnetExe) {
    try { $dotnetExe = (Get-Command dotnet -ErrorAction Stop).Source } catch {}
}
if (-not $dotnetExe) {
    Write-Host "ERROR: No se encontro .NET SDK. Instala .NET 8 desde https://dotnet.microsoft.com" -ForegroundColor Red
    Read-Host "Presiona Enter para salir"
    exit 1
}

# Compilar y publicar como exe auto-contenido
Write-Host "Compilando Bridge (primera vez puede tardar ~30 segundos)..." -ForegroundColor Yellow
& $dotnetExe publish $projectPath -c Release -r win-x64 --self-contained true -o $publishPath --nologo -v quiet
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR al compilar. Revisa que el proyecto este completo." -ForegroundColor Red
    Read-Host "Presiona Enter para salir"
    exit 1
}
Write-Host "Bridge compilado OK" -ForegroundColor Green

# Descargar SumatraPDF portable si no está instalado (necesario para copias correctas)
$sumatraDst = Join-Path $publishPath "SumatraPDF.exe"
$sumatraSystem = "C:\Program Files\SumatraPDF\SumatraPDF.exe"
if (-not (Test-Path $sumatraDst) -and -not (Test-Path $sumatraSystem)) {
    Write-Host "Descargando SumatraPDF (impresion silenciosa con copias correctas)..." -ForegroundColor Yellow
    try {
        $sumatraUrl = "https://www.sumatrapdfreader.org/dl/rel/3.5.2/SumatraPDF-3.5.2-64.exe"
        Invoke-WebRequest -Uri $sumatraUrl -OutFile $sumatraDst -UseBasicParsing -TimeoutSec 60
        Write-Host "SumatraPDF OK" -ForegroundColor Green
    } catch {
        Write-Host "No se pudo descargar SumatraPDF. Copias multiples se imprimiran como trabajos separados." -ForegroundColor Yellow
    }
} elseif (Test-Path $sumatraDst) {
    Write-Host "SumatraPDF ya presente en carpeta Bridge OK" -ForegroundColor Green
} else {
    Write-Host "SumatraPDF del sistema detectado OK" -ForegroundColor Green
}

# Registrar URI scheme inkora-bridge:// -> exe directo (HKCU, no necesita admin)
$origins = '{"protocol":"inkora-bridge","allowed_origins":["https://inkora.com.ar","https://www.inkora.com.ar","http://localhost:3000","http://127.0.0.1:3000"]}'
$regPath = "HKCU:\Software\Classes\inkora-bridge"
New-Item -Path $regPath -Force | Out-Null
Set-ItemProperty -Path $regPath -Name "(Default)" -Value "URL:INKORA Bridge Protocol"
Set-ItemProperty -Path $regPath -Name "URL Protocol" -Value ""
New-Item -Path "$regPath\DefaultIcon" -Force | Out-Null
Set-ItemProperty -Path "$regPath\DefaultIcon" -Name "(Default)" -Value "$exePath,0"
New-Item -Path "$regPath\shell\open\command" -Force | Out-Null
Set-ItemProperty -Path "$regPath\shell\open\command" -Name "(Default)" -Value "`"$exePath`" `"%1`""
Write-Host "URI scheme registrado OK" -ForegroundColor Green

# Politica Chrome: abrir inkora-bridge:// sin popup (HKLM, requiere admin)
try {
    New-Item -Path "HKLM:\SOFTWARE\Policies\Google\Chrome\AutoOpenProtocolsFromOrigins" -Force | Out-Null
    Set-ItemProperty -Path "HKLM:\SOFTWARE\Policies\Google\Chrome\AutoOpenProtocolsFromOrigins" -Name "1" -Value $origins
    Write-Host "Politica Chrome OK (sin popup)" -ForegroundColor Green
} catch {
    Write-Host "Politica Chrome: no se pudo aplicar (opcional)" -ForegroundColor Yellow
}

# Politica Edge: abrir inkora-bridge:// sin popup (HKLM, requiere admin)
try {
    New-Item -Path "HKLM:\SOFTWARE\Policies\Microsoft\Edge\AutoOpenProtocolsFromOrigins" -Force | Out-Null
    Set-ItemProperty -Path "HKLM:\SOFTWARE\Policies\Microsoft\Edge\AutoOpenProtocolsFromOrigins" -Name "1" -Value $origins
    Write-Host "Politica Edge OK (sin popup)" -ForegroundColor Green
} catch {
    Write-Host "Politica Edge: no se pudo aplicar (opcional)" -ForegroundColor Yellow
}

# Auto-inicio con Windows (acceso directo en Startup)
$startupFolder = [System.Environment]::GetFolderPath('Startup')
$shortcutPath  = Join-Path $startupFolder "INKORA Print Bridge.lnk"
$wsh      = New-Object -ComObject WScript.Shell
$shortcut = $wsh.CreateShortcut($shortcutPath)
$shortcut.TargetPath  = $exePath
$shortcut.WorkingDirectory = $publishPath
$shortcut.WindowStyle = 7
$shortcut.Description = "INKORA Print Bridge"
$shortcut.Save()
Write-Host "Auto-inicio con Windows configurado OK" -ForegroundColor Green

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Instalacion completada!" -ForegroundColor Green
Write-Host ""
Write-Host "- El Bridge arranca automaticamente con Windows" -ForegroundColor White
Write-Host "- El boton 'Iniciar Bridge' en la web lo abre sin confirmacion" -ForegroundColor White
Write-Host ""
Write-Host "Exe: $exePath" -ForegroundColor Gray
Write-Host ""
Read-Host "Presiona Enter para cerrar"
