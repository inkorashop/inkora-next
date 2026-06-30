$ErrorActionPreference = "Stop"

$port = 17389
$inUse = $false
try {
    $conn = New-Object System.Net.Sockets.TcpClient
    $conn.Connect("127.0.0.1", $port)
    $conn.Close()
    $inUse = $true
} catch {}

if ($inUse) { exit 0 }

# Buscar dotnet en ubicaciones conocidas
$dotnetCandidates = @(
    (Join-Path $env:ProgramFiles "dotnet\dotnet.exe"),
    (Join-Path ${env:ProgramFiles(x86)} "dotnet\dotnet.exe"),
    (Join-Path $env:USERPROFILE ".dotnet\dotnet.exe"),
    "dotnet.exe"
)

$dotnetExe = $null
foreach ($candidate in $dotnetCandidates) {
    try {
        if ($candidate -eq "dotnet.exe") {
            $resolved = (Get-Command dotnet -ErrorAction Stop).Source
            $dotnetExe = $resolved
            break
        } elseif (Test-Path $candidate) {
            $dotnetExe = $candidate
            break
        }
    } catch {}
}

if (-not $dotnetExe) {
    throw "No se encontro dotnet.exe. Instala .NET 8 SDK."
}

$projectPath = Join-Path $PSScriptRoot "Inkora.PrintBridge.csproj"
$outputPath  = Join-Path $PSScriptRoot "bin\LocalRun"

& $dotnetExe build $projectPath -o $outputPath
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

& $dotnetExe (Join-Path $outputPath "Inkora.PrintBridge.dll")
