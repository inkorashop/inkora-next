$ErrorActionPreference = "Stop"

$port = 17389
$inUse = $false
try {
    $conn = New-Object System.Net.Sockets.TcpClient
    $conn.Connect("127.0.0.1", $port)
    $conn.Close()
    $inUse = $true
} catch {}

if ($inUse) {
    exit 0
}

$dotnetDir = Join-Path $env:USERPROFILE ".dotnet"
$dotnetExe = Join-Path $dotnetDir "dotnet.exe"

if (-not (Test-Path $dotnetExe)) {
    throw "No se encontro dotnet en $dotnetExe. Instala .NET 8 SDK o ajusta la ruta."
}

$env:DOTNET_ROOT = $dotnetDir
$env:Path = "$dotnetDir;$env:Path"

$projectPath = Join-Path $PSScriptRoot "Inkora.PrintBridge.csproj"
$outputPath = Join-Path $PSScriptRoot "bin\LocalRun"

& $dotnetExe build $projectPath -o $outputPath
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

& $dotnetExe (Join-Path $outputPath "Inkora.PrintBridge.dll")
