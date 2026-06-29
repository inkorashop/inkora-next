$ErrorActionPreference = "Stop"

$startupFolder = [System.IO.Path]::Combine($env:APPDATA, "Microsoft\Windows\Start Menu\Programs\Startup")
$shortcutPath = Join-Path $startupFolder "INKORA Print Bridge.lnk"
$bridgeScript = Join-Path $PSScriptRoot "start-bridge.ps1"

if (-not (Test-Path $bridgeScript)) {
    throw "No se encontro start-bridge.ps1 en $PSScriptRoot"
}

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = "powershell.exe"
$shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$bridgeScript`""
$shortcut.WorkingDirectory = $PSScriptRoot
$shortcut.Description = "INKORA Print Bridge - Auto inicio con Windows"
$shortcut.WindowStyle = 7
$shortcut.Save()

Write-Host "Auto-inicio instalado en: $shortcutPath"
Write-Host "El Bridge se abrira automaticamente al iniciar sesion en Windows."
Write-Host ""
Write-Host "Para desinstalar, ejecuta:"
Write-Host "  Remove-Item `"$shortcutPath`""
