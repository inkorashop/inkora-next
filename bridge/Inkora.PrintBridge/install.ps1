# INKORA Print Bridge - Instalador
# Ejecutar con doble clic en install.bat. Se auto-eleva a administrador.

param([switch]$Elevated)

function Write-Header {
    Clear-Host
    Write-Host ""
    Write-Host "  INKORA Print Bridge" -ForegroundColor White -BackgroundColor DarkBlue
    Write-Host "  Instalador y actualizador local" -ForegroundColor Cyan
    Write-Host ""
}

function Write-Step([string]$Text) {
    Write-Host ""
    Write-Host "==> $Text" -ForegroundColor Cyan
}

function Write-Ok([string]$Text) {
    Write-Host "    OK     $Text" -ForegroundColor Green
}

function Write-Warn([string]$Text) {
    Write-Host "    AVISO  $Text" -ForegroundColor Yellow
}

function Write-Fail([string]$Text) {
    Write-Host "    ERROR  $Text" -ForegroundColor Red
}

Write-Header

if (-not $Elevated) {
    $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    if (-not $isAdmin) {
        Write-Step "Solicitando permisos de administrador"
        Start-Process powershell -Verb RunAs -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`" -Elevated" -Wait
        exit
    }
}

Write-Header

$scriptDir   = Split-Path -Parent $PSCommandPath
$projectPath = Join-Path $scriptDir "Inkora.PrintBridge.csproj"
$installPath = Join-Path $env:LOCALAPPDATA "Inkora\PrintBridge\app"
$exePath     = Join-Path $installPath "Inkora.PrintBridge.exe"
$packageExe  = Join-Path $scriptDir "Inkora.PrintBridge.exe"
$packageMode = Test-Path $packageExe

Write-Step "Preparando instalacion"
$running = Get-Process -Name "Inkora.PrintBridge" -ErrorAction SilentlyContinue
if ($running) {
    Write-Warn "Deteniendo Bridge en ejecucion..."
    $running | Stop-Process -Force
    Start-Sleep -Seconds 1
    Write-Ok "Bridge detenido"
} else {
    Write-Ok "No habia Bridge activo"
}

New-Item -ItemType Directory -Force $installPath | Out-Null
Write-Ok "Carpeta estable: $installPath"

if ($packageMode) {
    Write-Step "Instalando paquete descargado"
    $sourceFull = [IO.Path]::GetFullPath($scriptDir)
    $targetFull = [IO.Path]::GetFullPath($installPath)
    if ($sourceFull -ne $targetFull) {
        Get-ChildItem -Path $scriptDir -Force | ForEach-Object {
            Copy-Item -LiteralPath $_.FullName -Destination $installPath -Recurse -Force
        }
    }
    Write-Ok "Archivos copiados"
} else {
    Write-Step "Buscando .NET SDK"
    $dotnetExe = $null
    $candidates = @(
        (Join-Path $env:ProgramFiles "dotnet\dotnet.exe"),
        (Join-Path ${env:ProgramFiles(x86)} "dotnet\dotnet.exe"),
        (Join-Path $env:USERPROFILE ".dotnet\dotnet.exe")
    )
    foreach ($candidate in $candidates) {
        if (Test-Path $candidate) {
            $dotnetExe = $candidate
            break
        }
    }
    if (-not $dotnetExe) {
        try { $dotnetExe = (Get-Command dotnet -ErrorAction Stop).Source } catch {}
    }
    if (-not $dotnetExe) {
        Write-Fail "No se encontro .NET SDK. Instala .NET 8 desde https://dotnet.microsoft.com"
        Read-Host "Presiona Enter para salir"
        exit 1
    }
    Write-Ok ".NET detectado: $dotnetExe"

    Write-Step "Compilando Bridge"
    Write-Host "    Esto puede tardar alrededor de 30 segundos la primera vez..." -ForegroundColor Gray
    & $dotnetExe publish $projectPath -c Release -r win-x64 --self-contained true `
        -p:PublishSingleFile=true `
        -p:IncludeNativeLibrariesForSelfExtract=true `
        -p:IncludeAllContentForSelfExtract=true `
        -p:EnableCompressionInSingleFile=true `
        -o $installPath --nologo -v quiet
    if ($LASTEXITCODE -ne 0) {
        Write-Fail "No se pudo compilar. Revisa que el proyecto este completo."
        Read-Host "Presiona Enter para salir"
        exit 1
    }
    Write-Ok "Bridge compilado"
}

if (-not (Test-Path $exePath)) {
    Write-Fail "No se encontro Inkora.PrintBridge.exe en la instalacion."
    Read-Host "Presiona Enter para salir"
    exit 1
}

Write-Step "Verificando motor de impresion PDF"
$sumatraDst = Join-Path $installPath "SumatraPDF.exe"
$sumatraCandidates = @(
    (Join-Path $scriptDir "tools\SumatraPDF.exe"),
    (Join-Path $scriptDir "SumatraPDF.exe"),
    $sumatraDst,
    "C:\Program Files\SumatraPDF\SumatraPDF.exe",
    "C:\Program Files (x86)\SumatraPDF\SumatraPDF.exe"
)
$sumatraSrc = $sumatraCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($sumatraSrc) {
    if ($sumatraSrc -ne $sumatraDst) {
        Copy-Item $sumatraSrc $sumatraDst -Force
    }
    Write-Ok "SumatraPDF disponible"
} else {
    Write-Warn "SumatraPDF no esta instalado. Se descargara para copias multiples confiables."
    try {
        $sumatraUrl = "https://www.sumatrapdfreader.org/dl/rel/3.5.2/SumatraPDF-3.5.2-64.exe"
        Invoke-WebRequest -Uri $sumatraUrl -OutFile $sumatraDst -UseBasicParsing -TimeoutSec 60
        Write-Ok "SumatraPDF descargado"
    } catch {
        Write-Fail "No se pudo descargar SumatraPDF. Las copias multiples no seran confiables hasta instalarlo."
    }
}

Write-Step "Registrando apertura desde la web"
$origins = '{"protocol":"inkora-bridge","allowed_origins":["https://inkora.com.ar","https://www.inkora.com.ar","http://localhost:3000","http://127.0.0.1:3000"]}'
$regPath = "HKCU:\Software\Classes\inkora-bridge"
New-Item -Path $regPath -Force | Out-Null
Set-ItemProperty -Path $regPath -Name "(Default)" -Value "URL:INKORA Bridge Protocol"
Set-ItemProperty -Path $regPath -Name "URL Protocol" -Value ""
New-Item -Path "$regPath\DefaultIcon" -Force | Out-Null
Set-ItemProperty -Path "$regPath\DefaultIcon" -Name "(Default)" -Value "$exePath,0"
New-Item -Path "$regPath\shell\open\command" -Force | Out-Null
Set-ItemProperty -Path "$regPath\shell\open\command" -Name "(Default)" -Value "`"$exePath`" `"%1`""
Write-Ok "inkora-bridge:// registrado"

try {
    New-Item -Path "HKLM:\SOFTWARE\Policies\Google\Chrome\AutoOpenProtocolsFromOrigins" -Force | Out-Null
    Set-ItemProperty -Path "HKLM:\SOFTWARE\Policies\Google\Chrome\AutoOpenProtocolsFromOrigins" -Name "1" -Value $origins
    Write-Ok "Politica Chrome aplicada"
} catch {
    Write-Warn "Politica Chrome no aplicada (opcional)"
}

try {
    New-Item -Path "HKLM:\SOFTWARE\Policies\Microsoft\Edge\AutoOpenProtocolsFromOrigins" -Force | Out-Null
    Set-ItemProperty -Path "HKLM:\SOFTWARE\Policies\Microsoft\Edge\AutoOpenProtocolsFromOrigins" -Name "1" -Value $origins
    Write-Ok "Politica Edge aplicada"
} catch {
    Write-Warn "Politica Edge no aplicada (opcional)"
}

Write-Step "Configurando inicio automatico"
$startupFolder = [System.Environment]::GetFolderPath('Startup')
$shortcutPath  = Join-Path $startupFolder "INKORA Print Bridge.lnk"
$wsh      = New-Object -ComObject WScript.Shell
$shortcut = $wsh.CreateShortcut($shortcutPath)
$shortcut.TargetPath  = $exePath
$shortcut.WorkingDirectory = $installPath
$shortcut.WindowStyle = 7
$shortcut.Description = "INKORA Print Bridge"
$shortcut.Save()
Write-Ok "Auto-inicio configurado"

Write-Step "Iniciando Bridge"
Start-Process -FilePath $exePath -WorkingDirectory $installPath -WindowStyle Hidden
Start-Sleep -Seconds 2
Write-Ok "Bridge iniciado"

Write-Host ""
Write-Host "==========================================" -ForegroundColor DarkBlue
Write-Host "Instalacion completada correctamente" -ForegroundColor Green
Write-Host ""
Write-Host "- El Bridge arranca automaticamente con Windows" -ForegroundColor White
Write-Host "- La web puede iniciarlo con inkora-bridge://start" -ForegroundColor White
Write-Host "- SumatraPDF debe estar disponible para copias multiples exactas" -ForegroundColor White
Write-Host ""
Write-Host "Exe: $exePath" -ForegroundColor Gray
Write-Host ""
Read-Host "Presiona Enter para cerrar"
