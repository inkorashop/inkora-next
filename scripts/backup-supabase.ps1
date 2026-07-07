# Backup diario de la base de datos de Supabase (dump SQL completo del schema "public",
# donde viven las tablas reales de la app: products, designs, orders, etc).
#
# La cadena de conexion NUNCA se escribe en este archivo ni se sube a git — se lee de
# la variable de entorno SUPABASE_DB_URL, configurada una sola vez en esta PC.
# Ver BACKUPS.md para la configuracion inicial y como restaurar un backup.
#
# Corre solo/a via la tarea programada de Windows "Inkora - Backup Supabase diario".
# Tambien se puede ejecutar a mano en cualquier momento: powershell -File scripts\backup-supabase.ps1

$ErrorActionPreference = "Stop"

$dbUrl = $env:SUPABASE_DB_URL
if (-not $dbUrl) {
    Write-Error "Falta la variable de entorno SUPABASE_DB_URL. Ver BACKUPS.md para configurarla."
    exit 1
}

$projectRoot = Split-Path -Parent $PSScriptRoot
$backupDir   = Join-Path $projectRoot "backups\supabase"
$pgDump      = Join-Path $projectRoot "tools\pg-bin\pg_dump.exe"

if (-not (Test-Path $pgDump)) {
    Write-Error "No se encontro pg_dump.exe en $pgDump"
    exit 1
}

New-Item -ItemType Directory -Force -Path $backupDir | Out-Null

$timestamp = Get-Date -Format "yyyy-MM-dd_HHmm"
$outFile   = Join-Path $backupDir "supabase_$timestamp.sql"

& $pgDump $dbUrl --schema=public --no-owner --no-privileges -f $outFile

if ($LASTEXITCODE -ne 0) {
    Write-Error "pg_dump fallo con codigo $LASTEXITCODE"
    exit $LASTEXITCODE
}

# Retencion: se guardan los ultimos 30 backups diarios (~1 mes); los mas viejos se borran solos.
$keep = 30
Get-ChildItem -Path $backupDir -Filter "supabase_*.sql" |
    Sort-Object LastWriteTime -Descending |
    Select-Object -Skip $keep |
    Remove-Item -Force

Write-Output "Backup OK: $outFile"
