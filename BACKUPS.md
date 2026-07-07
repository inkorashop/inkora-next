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

## Panel visual (`tools/backup-app/`)

Hay un programita local con estética Inkora para ver el estado del backup y disparar uno a mano, sin usar la terminal.

- **Acceso directo en el Escritorio**: "Inkora - Backup Supabase". Doble clic y abre una ventanita chica (sin barra de direcciones, como una app) con:
  - Fecha/hora del último backup y su tamaño.
  - Cantidad de tablas, filas aproximadas y tamaño actual de la base (en vivo, consultando Supabase).
  - Un botón **"Hacer backup ahora"** — un solo clic, sin confirmación, arranca al toque y muestra el progreso real de `pg_dump` (qué tabla está volcando en cada momento).
  - Al terminar, muestra la ruta del archivo generado y un botón **"Abrir carpeta"** que lo abre en el Explorador de Windows.
- **Corrida automática de las 3 AM**: la tarea programada ahora abre esta misma ventanita sola (en vez de correr todo escondido), dispara el backup automáticamente sin que haya que tocar nada, y a los 10 segundos de terminar se cierra sola con una cuenta regresiva visible. Es la forma de "ver" que el backup nocturno realmente pasó, sin tener que ir a revisar la carpeta a mano.
- **Cómo está armado por dentro**: es un servidorcito local en Node (`tools/backup-app/server.js`, puerto 4173, solo escucha en `127.0.0.1` — no accesible desde otras PCs ni desde internet) que sirve una mini-página (`tools/backup-app/public/`) y se abre en una ventana "app mode" de Edge/Chrome (`--app=`, sin pestañas ni barra de direcciones). El lanzador es `tools/backup-app/launch.vbs`, que arranca el servidor oculto y después abre la ventana. Tiene sus propias dependencias en `tools/backup-app/node_modules/` (excluidas de git); si se clona el proyecto en otra PC hay que correr `npm install` ahí adentro antes de usarlo.
- **Si se borra o rompe el acceso directo del Escritorio**, se puede recrear apuntando a `wscript.exe "<ruta-al-proyecto>\tools\backup-app\launch.vbs"`, o simplemente correr `tools\backup-app\launch.vbs` con doble clic directo (funciona igual, sin acceso directo).

## Probarlo ahora mismo (opcional, para confirmar que funciona)

Después del paso 2 de arriba, abrí una PowerShell **nueva** (importante: tiene que ser nueva, para que tome la variable recién seteada) y corré:

```powershell
powershell -File "c:\Users\compu\Desktop\Code\inkora-next\scripts\backup-supabase.ps1"
```

Si todo está bien, va a aparecer un archivo nuevo en `backups\supabase\supabase_<fecha>.sql` y el mensaje final va a decir `Backup OK: ...`.

## Cómo funciona

- **Tarea programada**: "Inkora - Backup Supabase diario" (Windows Task Scheduler), corre todos los días a las 3:00 AM. Si la PC está apagada a esa hora, Windows la corre apenas la prendés de nuevo (no se pierde el día). Desde que existe el panel visual, la tarea abre `tools/backup-app/launch.vbs autorun` (ver sección de arriba) en vez de correr el script escondido — así el backup nocturno también se ve, no solo el que se dispara a mano.
- **Script standalone**: `scripts/backup-supabase.ps1` sigue existiendo y sigue funcionando igual (útil para correrlo a mano por PowerShell sin abrir ninguna ventana, o como respaldo si el panel visual llegara a fallar) — llama a `pg_dump.exe` con la cadena de conexión guardada en la variable de entorno, y guarda el resultado en `backups/supabase/`. El panel visual (`tools/backup-app/server.js`) hace básicamente lo mismo pero por su cuenta, sin depender de este script.
- **`pg_dump.exe`**: vive en `tools/pg-bin/` (vendorizado directo del instalador oficial de PostgreSQL, ~44MB, sin necesidad de instalar Postgres completo ni permisos de administrador — se descargó y se dejó ahí para este propósito). Tanto el script como el panel visual lo usan.
- **Retención**: se guardan los últimos 30 backups diarios (~1 mes); los más viejos se borran solos para no acumular espacio infinito. Si querés guardar más/menos, cambiá el número `$keep = 30` en el script.
- **Alcance del dump**: solo el schema `public` (tus tablas de negocio). No incluye los esquemas internos de Supabase (`auth`, `storage`, etc.) ni los archivos del bucket de Storage (imágenes/GLB) — eso es un backup aparte, no cubierto por esto. Si en algún momento también querés los usuarios/emails de `auth.users` en el dump, avisame y agrego `--schema=auth` al script.

## Si el backup empieza a fallar solo (conexión directa vs Session Pooler)

La `SUPABASE_DB_URL` configurada usa la **conexión directa** de Supabase (`db.<project-ref>.supabase.co:5432`), que por defecto viaja por **IPv6**. Si en algún momento la red de esta PC deja de tener salida IPv6 (cambio de router, de proveedor de internet, etc.), el backup diario va a empezar a fallar en silencio con timeout de conexión — la tarea programada sigue "corriendo" pero no genera ningún archivo nuevo en `backups/supabase/`.

**Cómo diagnosticarlo**: si hace varios días que no aparece un backup nuevo, correr a mano `powershell -File scripts\backup-supabase.ps1` en una PowerShell nueva y ver el error — si menciona timeout o "could not connect", es esto.

**Cómo arreglarlo**: cambiar a la conexión por **Session Pooler**, que sí funciona por IPv4:

1. Dashboard de Supabase → botón **Connect** → en el selector de arriba (donde antes decía "Direct connection") elegí **"Session pooler"**.
2. Vas a ver una cadena parecida a esta (el host y el usuario cambian de formato — OJO que el usuario pasa a ser `postgres.<project-ref>`, no solo `postgres`):
   ```
   postgresql://postgres.ylawwaoznxzxwetlkjel:[YOUR-PASSWORD]@aws-0-<region>.pooler.supabase.com:5432/postgres
   ```
3. Reemplazar `[YOUR-PASSWORD]` por la contraseña real y volver a correr el mismo comando de configuración inicial (paso 2 de más arriba) con esta nueva cadena — pisa el valor anterior de `SUPABASE_DB_URL` sin problema.

No hace falta esperar a que falle para hacer este cambio — si en algún momento se quiere usar el pooler de entrada, es válido usarlo directamente en vez de la conexión directa; ambas funcionan igual para `pg_dump`.

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
