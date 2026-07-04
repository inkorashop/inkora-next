param([string]$Version = "1.6.5")
$ErrorActionPreference = "Stop"

$projDir  = "$PSScriptRoot\Inkora.PrintBridge"
$stageDir = "$projDir\bin\stage"
$outDir   = "$stageDir\Inkora PrintBridge"
$zipPath  = "$projDir\bin\Inkora.PrintBridge.zip"

Write-Host "==> Inkora Print Bridge v$Version"

# Clean staging
if (Test-Path $stageDir) { Remove-Item $stageDir -Recurse -Force }
New-Item -ItemType Directory -Force $outDir | Out-Null

# Publish single-file self-contained win-x64
Write-Host "==> Publicando (single-file, self-contained, win-x64)..."
& "C:\Program Files\dotnet\dotnet.exe" publish "$projDir\Inkora.PrintBridge.csproj" `
    -c Release -r win-x64 --self-contained `
    -p:PublishSingleFile=true `
    -p:IncludeNativeLibrariesForSelfExtract=true `
    -p:IncludeAllContentForSelfExtract=true `
    -p:EnableCompressionInSingleFile=true `
    -p:Version=$Version `
    -o "$stageDir\publish"

if (-not $?) { Write-Error "dotnet publish fallo"; exit 1 }

# Copy exe to output folder (skip debug/temp files)
Write-Host "==> Copiando archivos al paquete..."
$skip = @("*.pdb", "createdump.exe", "*.deps.json")
Get-ChildItem "$stageDir\publish" | Where-Object {
    $name = $_.Name
    -not ($skip | Where-Object { $name -like $_ })
} | ForEach-Object {
    Copy-Item $_.FullName "$outDir\" -Recurse
}

# Ensure SumatraPDF is bundled. Multiple copies must be a single reliable print job,
# not N shell-printto jobs.
$sumatraDst = Join-Path $outDir "SumatraPDF.exe"
$sumatraCandidates = @(
    (Join-Path $projDir "tools\SumatraPDF.exe"),
    (Join-Path $projDir "bin\Published\SumatraPDF.exe"),
    "C:\Program Files\SumatraPDF\SumatraPDF.exe",
    "C:\Program Files (x86)\SumatraPDF\SumatraPDF.exe"
)
$sumatraSrc = $sumatraCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($sumatraSrc) {
    Copy-Item $sumatraSrc $sumatraDst -Force
    Write-Host "==> SumatraPDF incluido desde: $sumatraSrc"
} else {
    Write-Host "==> SumatraPDF no encontrado localmente. Descargando portable..."
    $sumatraUrl = "https://www.sumatrapdfreader.org/dl/rel/3.5.2/SumatraPDF-3.5.2-64.exe"
    Invoke-WebRequest -Uri $sumatraUrl -OutFile $sumatraDst -UseBasicParsing -TimeoutSec 90
    Write-Host "==> SumatraPDF descargado e incluido."
}

# Include the package installer. It installs this folder into
# %LOCALAPPDATA%\Inkora\PrintBridge\app, registers inkora-bridge:// and starts it.
Copy-Item (Join-Path $projDir "install.ps1") (Join-Path $outDir "install.ps1") -Force
Copy-Item (Join-Path $projDir "install.bat") (Join-Path $outDir "install.bat") -Force
@"
INKORA Print Bridge v$Version

Instalacion recomendada:
1. Extraer este ZIP completo.
2. Ejecutar install.bat.
3. El instalador copia el Bridge a %LOCALAPPDATA%\Inkora\PrintBridge\app.
4. El Bridge incluye SumatraPDF.exe para imprimir multiples copias como un unico trabajo.

No ejecutes el Bridge directamente desde Descargas si queres una instalacion estable.
"@ | Set-Content -Path (Join-Path $outDir "LEEME-INSTALACION.txt") -Encoding ASCII

# Show what ended up in the package
Write-Host ""
Write-Host "==> Contenido del paquete:"
Get-ChildItem $outDir | Select-Object Name, @{n="MB";e={[math]::Round($_.Length/1MB,1)}} | Format-Table -AutoSize

# Create ZIP
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
Write-Host "==> Creando ZIP..."
Compress-Archive -Path $outDir -DestinationPath $zipPath

$sizeMB = [math]::Round((Get-Item $zipPath).Length / 1MB, 1)
Write-Host ""
Write-Host "==> Listo: $zipPath ($sizeMB MB)"
Write-Host "==> Para publicar en GitHub:"
Write-Host "    gh release create bridge-v$Version $zipPath --title 'Bridge v$Version' --notes 'ZIP reorganizado: una carpeta con todo.'"
