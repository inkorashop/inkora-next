param([string]$Version = "1.6.13")
$ErrorActionPreference = "Stop"

$projDir  = "$PSScriptRoot\Inkora.PrintBridge"
$stageDir = "$projDir\bin\stage"
$outDir   = "$stageDir\Inkora PrintBridge"
$zipPath  = "$projDir\bin\Inkora.PrintBridge.zip"
$setupPath = "$projDir\bin\Inkora.PrintBridge.Setup.exe"
$iconPath = "$projDir\inkora.ico"

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

Instalacion desde ZIP tecnico:
1. Extraer este ZIP completo.
2. Ejecutar install.bat.
3. El instalador copia el Bridge a %LOCALAPPDATA%\Inkora\PrintBridge\app.
4. El Bridge incluye SumatraPDF.exe para imprimir multiples copias como un unico trabajo.

Para usuarios finales, usar Inkora.PrintBridge.Setup.exe.
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

# Create single-file installer for normal users. The ZIP remains available as
# the internal auto-update payload because already-installed Bridges know how
# to replace themselves from that format.
if (Test-Path $setupPath) { Remove-Item $setupPath -Force }
$iexpress = Join-Path $env:WINDIR "System32\iexpress.exe"
if (Test-Path $iexpress) {
    Write-Host "==> Creando instalador EXE..."
    $iexpressWorkDir = Join-Path ([IO.Path]::GetTempPath()) "InkoraBridgeSetup_$($Version.Replace('.', '_'))"
    $iexpressSourceDir = Join-Path $iexpressWorkDir "src"
    $iexpressTarget = Join-Path $iexpressWorkDir "setup.exe"
    if (Test-Path $iexpressWorkDir) { Remove-Item $iexpressWorkDir -Recurse -Force }
    New-Item -ItemType Directory -Force $iexpressSourceDir | Out-Null
    Copy-Item (Join-Path $outDir "*") $iexpressSourceDir -Recurse -Force

    $sedPath = Join-Path $iexpressWorkDir "setup.sed"
    $installerFiles = Get-ChildItem $iexpressSourceDir -File | Sort-Object Name
    $fileStrings = @()
    $fileEntries = @()
    for ($i = 0; $i -lt $installerFiles.Count; $i++) {
        $fileStrings += "FILE$i=$($installerFiles[$i].Name)"
        $fileEntries += "%FILE$i%="
    }
    $sourceDir = $iexpressSourceDir.TrimEnd('\') + '\'
    $sedContent = @"
[Version]
Class=IEXPRESS
SEDVersion=3

[Options]
PackagePurpose=InstallApp
ShowInstallProgramWindow=1
HideExtractAnimation=1
UseLongFileName=1
InsideCompressed=0
CAB_FixedSize=0
CAB_ResvCodeSigning=0
RebootMode=N
InstallPrompt=%InstallPrompt%
DisplayLicense=%DisplayLicense%
FinishMessage=%FinishMessage%
TargetName=%TargetName%
FriendlyName=%FriendlyName%
IconFile=%IconFile%
AppLaunched=%AppLaunched%
PostInstallCmd=%PostInstallCmd%
AdminQuietInstCmd=%AdminQuietInstCmd%
UserQuietInstCmd=%UserQuietInstCmd%
SourceFiles=SourceFiles

[Strings]
InstallPrompt=
DisplayLicense=
FinishMessage=
TargetName=$iexpressTarget
FriendlyName=INKORA Print Bridge v$Version
IconFile=$iconPath
AppLaunched=powershell.exe -NoProfile -ExecutionPolicy Bypass -File install.ps1
PostInstallCmd=<None>
AdminQuietInstCmd=powershell.exe -NoProfile -ExecutionPolicy Bypass -File install.ps1
UserQuietInstCmd=powershell.exe -NoProfile -ExecutionPolicy Bypass -File install.ps1
$($fileStrings -join "`r`n")

[SourceFiles]
SourceFiles0=$sourceDir

[SourceFiles0]
$($fileEntries -join "`r`n")
"@
    Set-Content -Path $sedPath -Value $sedContent -Encoding ASCII
    $iexpressProcess = Start-Process -FilePath $iexpress -ArgumentList @('/N', '/Q', $sedPath) -Wait -PassThru
    if ($iexpressProcess.ExitCode -ne 0 -or -not (Test-Path $iexpressTarget)) {
        throw "IExpress no pudo generar el instalador EXE."
    }
    Move-Item -Path $iexpressTarget -Destination $setupPath -Force
    . (Join-Path $PSScriptRoot "Set-ExeIcon.ps1")
    Set-ExeIcon -ExePath $setupPath -IconPath $iconPath -GroupId 3000
    $setupSizeMB = [math]::Round((Get-Item $setupPath).Length / 1MB, 1)
    Write-Host "==> Listo: $setupPath ($setupSizeMB MB)"
} else {
    Write-Warning "IExpress no encontrado; no se genero Inkora.PrintBridge.Setup.exe."
}

Write-Host "==> Para publicar en GitHub:"
Write-Host "    gh release create bridge-v$Version $setupPath $zipPath --title 'Bridge v$Version' --notes 'Instalador EXE para usuarios + ZIP tecnico para auto-update.'"
