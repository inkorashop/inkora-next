# install-uri-scheme.ps1
# Ejecuta esto UNA VEZ para poder abrir el Bridge con el boton de la pagina web.
# No requiere permisos de administrador.

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$startScript = Join-Path $scriptDir "start-bridge.ps1"

if (-not (Test-Path $startScript)) {
    Write-Host "Error: no se encontro start-bridge.ps1 en $scriptDir" -ForegroundColor Red
    exit 1
}

$command = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$startScript`""
$regPath = "HKCU:\Software\Classes\inkora-bridge"

try {
    New-Item -Path $regPath -Force | Out-Null
    Set-ItemProperty -Path $regPath -Name "(Default)" -Value "URL:INKORA Bridge Protocol"
    Set-ItemProperty -Path $regPath -Name "URL Protocol" -Value ""

    New-Item -Path "$regPath\DefaultIcon" -Force | Out-Null
    Set-ItemProperty -Path "$regPath\DefaultIcon" -Name "(Default)" -Value "powershell.exe,0"

    New-Item -Path "$regPath\shell\open\command" -Force | Out-Null
    Set-ItemProperty -Path "$regPath\shell\open\command" -Name "(Default)" -Value $command

    Write-Host ""
    Write-Host "Listo! URI scheme inkora-bridge:// registrado." -ForegroundColor Green
    Write-Host "El boton 'Iniciar Bridge' en la web ahora abre el Bridge automaticamente." -ForegroundColor Green
    Write-Host ""
} catch {
    Write-Host "Error: $_" -ForegroundColor Red
    exit 1
}
