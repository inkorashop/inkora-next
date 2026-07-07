# Backups automáticos de Supabase

Backup diario, automático y local del schema `public` de la base de datos (las tablas reales de la app: `products`, `designs`, `orders`, etc — ver la lista completa en `CONTEXT.md`). Corre solo, sin que tengas que acordarte de nada, vía una tarea programada de Windows.

**Los archivos de backup y la contraseña de la base NUNCA se suben a git** — quedan solo en tu PC, dentro de la carpeta del proyecto pero excluidos por `.gitignore`. Esto respeta la regla de seguridad que ya tenía `CONTEXT.md` ("no subir dumps de Supabase / backups SQL con datos reales").

## Configuración inicial (una sola vez)

1. Andá al Dashboard de Supabase → tu proyecto → **Project Settings → Database → Connection string** → pestaña **URI**. Copiá esa cadena completa (incluye usuario, contraseña, host y puerto).
2. Abrí PowerShell en tu PC (no hace falta que sea como administrador) y corré esto, reemplazando el valor por la cadena que copiaste (con la contraseña real puesta en el lugar que dice `[YOUR-PASSWORD]` o similar):

   ```powershell
   [System.Environment]::SetEnvironmentVariable("SUPABASE_DB_URL", "postgresql://postgres.xxxxx:TU_PASSWORD@...:5432/postgres", "User")
   ```

3. Cerrá esa ventana de PowerShell. Listo — la tarea programada ya está creada y a partir de ahora la va a poder leer.

Esto es lo único que tenés que hacer vos a mano. El resto (la tarea programada, el script, `pg_dump.exe`) ya está armado y andando.

## Probarlo ahora mismo (opcional, para confirmar que funciona)

Después del paso 2 de arriba, abrí una PowerShell **nueva** (importante: tiene que ser nueva, para que tome la variable recién seteada) y corré:

```powershell
powershell -File "c:\Users\compu\Desktop\Code\inkora-next\scripts\backup-supabase.ps1"
```

Si todo está bien, va a aparecer un archivo nuevo en `backups\supabase\supabase_<fecha>.sql` y el mensaje final va a decir `Backup OK: ...`.

## Cómo funciona

- **Tarea programada**: "Inkora - Backup Supabase diario" (Windows Task Scheduler), corre todos los días a las 3:00 AM. Si la PC está apagada a esa hora, Windows la corre apenas la prendés de nuevo (no se pierde el día).
- **Script**: `scripts/backup-supabase.ps1` — llama a `pg_dump.exe` con la cadena de conexión guardada en la variable de entorno, y guarda el resultado en `backups/supabase/`.
- **`pg_dump.exe`**: vive en `tools/pg-bin/` (vendorizado directo del instalador oficial de PostgreSQL, ~44MB, sin necesidad de instalar Postgres completo ni permisos de administrador — se descargó y se dejó ahí para este propósito).
- **Retención**: se guardan los últimos 30 backups diarios (~1 mes); los más viejos se borran solos para no acumular espacio infinito. Si querés guardar más/menos, cambiá el número `$keep = 30` en el script.
- **Alcance del dump**: solo el schema `public` (tus tablas de negocio). No incluye los esquemas internos de Supabase (`auth`, `storage`, etc.) ni los archivos del bucket de Storage (imágenes/GLB) — eso es un backup aparte, no cubierto por esto. Si en algún momento también querés los usuarios/emails de `auth.users` en el dump, avisame y agrego `--schema=auth` al script.

## Ver las tareas o desactivarla

```powershell
# Ver el historial de corridas
Get-ScheduledTaskInfo -TaskName "Inkora - Backup Supabase diario"

# Desactivarla sin borrarla
Disable-ScheduledTask -TaskName "Inkora - Backup Supabase diario"

# Borrarla del todo
Unregister-ScheduledTask -TaskName "Inkora - Backup Supabase diario"
```

## Restaurar un backup

Un archivo de `backups/supabase/*.sql` se puede restaurar a **cualquier base Postgres** (no hace falta que sea Supabase) con:

```powershell
tools\pg-bin\pg_dump.exe --version   # (confirmar que el binario esta ahi)
# restaurar con psql (no incluido en tools/pg-bin — instalar Postgres completo o el paquete de binarios de https://www.enterprisedb.com/download-postgresql-binaries si hace falta)
psql "<connection-string-del-destino>" -f backups\supabase\supabase_2026-07-07_0300.sql
```
