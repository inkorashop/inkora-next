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

Programa local con estética Inkora para ver el estado de los backups y dispararlos a mano, sin usar la terminal. Desde este panel se manejan **dos copias independientes**: la de la **base de datos** (Supabase) y la del **código del proyecto** (un zip liviano, sin `node_modules`/`.git`/artefactos de build — ver más abajo).

- **Acceso directo en el Escritorio**: "Inkora Backups" (con el logo de Inkora como ícono). Doble clic y abre una ventanita tipo app (sin barra de direcciones ni pestañas), del tamaño de un cuarto de la pantalla, con dos secciones lado a lado — Base de datos y Código del proyecto — cada una con:
  - Fecha/hora del último backup y su tamaño.
  - En la de base de datos, además: cantidad de tablas, filas aproximadas y tamaño actual, en vivo desde Supabase.
  - **Carpeta local** y **carpeta en Drive** configurables desde ahí mismo, cada una con un botón "Cambiar" que abre el selector de carpetas nativo de Windows.
  - **Frecuencia** configurable (todos los días / cada 3 días / semanal / cada 2 semanas / mensual) — por defecto la base de datos es diaria y el código semanal.
  - Una barra fina que muestra cuánto falta para la próxima copia automática.
  - Botón **"Hacer copia ahora"** — un clic, sin confirmación, con una barra de progreso real (no una animación genérica): para la base de datos cuenta tablas volcadas sobre el total; para el código, archivos comprimidos sobre el total.
  - Al terminar: ruta del archivo generado (local, y en Drive si esa carpeta está configurada) + botones para abrir cada carpeta en el Explorador.
- **Copia a Google Drive**: si configuraste una carpeta de Drive para alguna de las dos, al terminar la copia local el archivo se duplica ahí también. Como es la carpeta sincronizada de **Google Drive de escritorio** (una letra de unidad tipo `Z:\Mi unidad\...`), es una copia de archivo común y corriente — **nunca se borra ni se toca nada más de esa carpeta**, solo se agregan archivos nuevos.
- **Corrida automática**: la tarea programada de Windows abre este mismo panel una vez por día (3 AM), en modo automático: revisa qué corresponde correr según la frecuencia configurada de cada una (la base de datos casi siempre, el código solo cuando toca), lo corre, y a los 10 segundos de terminar intenta cerrarse sola con una cuenta regresiva visible. *(Nota: algunas versiones de Edge no dejan que una ventana se cierre a sí misma aunque se haya abierto en modo app — si eso pasa, el panel se queda abierto mostrando "Listo, ya podés cerrar esta ventana" en vez de quedar colgado sin explicación; el backup en sí ya terminó igual, cerrar la ventana a mano no afecta nada.)*
- **Cómo está armado por dentro**: un servidor local en Node (`tools/backup-app/server.js`, puerto 4173, solo escucha en `127.0.0.1` — no accesible desde otras PCs ni desde internet) que sirve la mini-página (`tools/backup-app/public/`) y se abre en una ventana "app mode" de Edge/Chrome (`--app=`). El lanzador es `tools/backup-app/Inkora-Backups.vbs`, que arranca el servidor oculto y después abre la ventana (la ventana se redimensiona sola a 1/4 de la pantalla real vía JavaScript apenas carga). La configuración (rutas, frecuencias) vive en `tools/backup-app/config.json`, específico de esta PC — no se versiona. Tiene sus propias dependencias en `tools/backup-app/node_modules/` (tampoco versionadas); si se clona el proyecto en otra PC hay que correr `npm install` ahí adentro antes de usarlo.
- **Si se borra o rompe el acceso directo del Escritorio**, se puede recrear apuntando a `wscript.exe "<ruta-al-proyecto>\tools\backup-app\Inkora-Backups.vbs"` (el ícono está en `tools/backup-app/icon.ico`), o simplemente correr `Inkora-Backups.vbs` con doble clic directo (funciona igual, sin acceso directo).

### Backup del código del proyecto

Pensado como una capa extra de tranquilidad, no como algo tan crítico como el de la base de datos — el código ya vive completo (con historial) tanto en esta PC como en GitHub, así que no depende de un solo lugar como sí dependían los datos antes de armar todo esto. Por eso viene con frecuencia semanal por defecto en vez de diaria.

Es un `.zip` del código fuente actual (no el historial de git, eso ya está en GitHub), excluyendo automáticamente: `node_modules`, `.next`, `.git`, `.vercel`, `coverage`, carpetas de build de .NET/Android (`bin`, `obj`, `build`, `.gradle`, `.vs`), los binarios/modelos grandes ya excluidos de git (`tools/pg-bin`, `public/models`), el ejecutable vendorizado del puente de impresión (`bridge/Inkora.PrintBridge/tools`), y el zip distribuible `Inkora.PrintBridge.zip` de la raíz. Si en el futuro aparece alguna carpeta nueva pesada que no debería ir en el backup de código, avisar para sumarla a la lista de exclusiones en `tools/backup-app/server.js`.

## Probarlo ahora mismo (opcional, para confirmar que funciona)

Después del paso 2 de arriba, abrí una PowerShell **nueva** (importante: tiene que ser nueva, para que tome la variable recién seteada) y corré:

```powershell
powershell -File "c:\Users\compu\Desktop\Code\inkora-next\scripts\backup-supabase.ps1"
```

Si todo está bien, va a aparecer un archivo nuevo en `backups\supabase\supabase_<fecha>.sql` y el mensaje final va a decir `Backup OK: ...`.

## Cómo funciona

- **Tarea programada**: "Inkora - Backup Supabase diario" (Windows Task Scheduler), corre todos los días a las 3:00 AM. Si la PC está apagada a esa hora, Windows la corre apenas la prendés de nuevo (no se pierde el día). La tarea abre `tools/backup-app/Inkora-Backups.vbs autorun` (ver sección "Panel visual" de arriba) en vez de correr el script escondido — así el backup nocturno también se ve, no solo el que se dispara a mano. Pese al nombre de la tarea (quedó de cuando solo existía el backup de base de datos), hoy también dispara el del código cuando corresponde según su frecuencia.
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

Un archivo de `backups/code/codigo_*.zip` (o su copia en Drive) es un zip común — se descomprime con lo que sea (Explorador de Windows, 7-Zip, etc.) y ya está: es el código fuente tal cual estaba en ese momento, sin `node_modules` ni artefactos de build (hay que correr `npm install` de nuevo después de descomprimir).
