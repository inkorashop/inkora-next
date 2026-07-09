# INKORA - Contexto del proyecto

## Protocolo para IAs
El archivo de entrada unico para iniciar trabajo con una IA es `AGENTS.md`.

Si una IA abre primero este archivo por deteccion automatica, debe volver a `AGENTS.md` y seguir el protocolo completo antes de modificar cualquier cosa.

Resumen del arranque obligatorio definido en `AGENTS.md`:

1. Leer `AGENTS.md`.
2. Leer este `CONTEXT.md`.
3. Leer `AI_RUN_LOG.md`.
4. Revisar `git status --short`.
5. Auditar la ultima entrada relevante de `AI_RUN_LOG.md`.
6. Trabajar en la tarea pedida.
7. Actualizar `AI_RUN_LOG.md` al terminar el turno de trabajo.

Prompt corto recomendado para el usuario:

`Lee AGENTS.md y segui el protocolo del proyecto. Tarea: ...`

## Stack
- Next.js 14 (App Router)
- Supabase (DB + Auth + Storage)
- Vercel (deploy automático desde GitHub)
- Resend (emails)

## URLs
- Producción: inkora-next.vercel.app
- Dominio en propagación: inkora.com.ar
- Admin: /admin
- Panel usuario: /dashboard

## Supabase
- URL: https://ylawwaoznxzxwetlkjel.supabase.co
- Project ID: ylawwaoznxzxwetlkjel
- Bucket storage: assets
- Carpetas principales del bucket: thumbnails, models
- Tabla designs tiene columna model_url nullable para archivos GLB

## WhatsApp
- Número: 5493765211017

## Deploy
- Vercel detecta los push a GitHub y despliega automáticamente.
- Antes de pushear cambios importantes, ejecutar: CI=true npm run build
- Flujo sugerido: git status, git add ., git commit -m "mensaje", git push
- Regla operativa del proyecto: despues de terminar modificaciones de codigo, hacer deploy a produccion salvo que se indique explicitamente lo contrario.
- Deploy manual desde PowerShell:
  - npm.cmd run build
  - vercel.cmd deploy --prod --yes
- Si el cambio incluye SQL, ejecutar primero o coordinar la ejecucion del script correspondiente en Supabase SQL Editor; el deploy de Vercel no aplica migraciones SQL.

## Tablas principales Supabase
- products
- designs
- orders
- localities
- price_tiers
- profiles
- admins
- carts
- settings
- sellers
- user_product_localities
- production_stock
- production_status
- production_stock_log
- admin_activity_events
- admin_version_snapshots
- user_activity_events
- user_presence
- admin_presence

## Notas importantes
- Google OAuth configurado en Supabase.
- Admin usa tabla admins para verificar acceso.
- Precios escalonados por localidad en price_tiers.
- "Sin localidad" es una localidad real en la tabla localities.
- Visor 3D implementado con Three.js usando el componente ModelViewer.
- Productos con allow_glb=true permiten subir archivos GLB en lugar de imagen.
- Emails vía Resend: al confirmar pedido se envían dos emails automáticos: confirmación al cliente y notificación a INKORA con CSV adjunto.

## Variantes de productos
- Existe soporte para variantes de productos.
- La lógica relacionada está documentada en sql/product_variants.sql.
- En catálogo, las variantes se muestran como tabs/botones simples, separados visualmente de las categorías.
- Las variantes no deben confundirse con categorías.
- Las variantes representan presentaciones o versiones de un mismo producto.

## Escalas de precio por cliente y producto
- Existe soporte para asignar una localidad/escala de precio específica por cliente y producto.
- La tabla usada para esto es user_product_localities.
- El script relacionado está en sql/user_product_price_scales.sql.
- Si un cliente tiene una asignación específica para un producto, se usa esa localidad/escala para calcular el precio.
- Si no tiene asignación específica, se mantiene el comportamiento normal del sistema.
- Esta lógica no debe romper el uso general de price_tiers.

## Planes de features pendientes
- `CHAT_FEATURE_PLAN.md`: plan detallado de un chat interno para el admin (reemplaza la pestana Notificaciones). Solo planeado, no implementado todavia. Leer ese archivo completo antes de empezar a programarlo.

## Features implementadas con documentacion propia
- `VOICE_ORDER_FEATURE.md`: como funciona la carga de pedidos por voz en Admin > Nuevo pedido (gramatica de comandos, campos reconocidos, matching de disenos, limitaciones conocidas de Android). Leer antes de diagnosticar cualquier reporte de bug sobre esta funcion — un nombre de diseno "raro" dictado por voz puede ser el nombre real de un diseno del catalogo, no un error de transcripcion.
- `EXTRA_DESIGNS_FEATURE.md`: como funciona agregar un diseno extra a un pedido ya existente, desde "Ver pedido" o desde Produccion (admin y operario). Leer antes de tocar `add_order_extra_design`, `admin_sync_order_production_tasks`, `get_operator_production_tasks`, o el resumen "A producir" de Produccion — la regla de que el resaltado solo se ve en la vista donde se agrego (no en ambas) es una decision de diseno explicita, no un bug.
- `IMAGE_ASSET_CACHING.md`: como funciona el proxy propio (`app/api/asset/[...path]/route.js` + `components/SafeImage.js`) que hace que las imagenes del catalogo cacheen bien en el navegador y en el edge de Vercel, sin depender de Supabase Pro (Supabase Free no manda el `Cache-Control` real que se configura al subir el archivo). Leer antes de recomendar pasar a Supabase Pro para "arreglar" cacheo de imagenes, o antes de tocar esos dos archivos.
- `BACKUPS.md`: backup automatico local (tarea programada de Windows, no en la nube) de la base de datos de Supabase (`pg_dump`, diario) y del codigo del proyecto (zip liviano, semanal), con copia opcional a Google Drive de escritorio (carpeta local sincronizada, sin API ni OAuth). Panel visual con estetica Inkora en `tools/backup-app/` (acceso directo "Inkora Backups" en el Escritorio). Todo lo que contiene datos reales o es especifico de esta PC (`backups/`, `tools/pg-bin/`, `tools/backup-app/config.json`, `tools/backup-app/node_modules/`) esta excluido por `.gitignore` a proposito. No recrear esta automatizacion desde cero sin leer primero ese archivo.

## Realtime / Admin
- Hay scripts SQL relacionados con realtime y actividad admin: sql/admin_realtime.sql, sql/admin_activity_events.sql, sql/admin_version_snapshots.sql y sql/user_activity_events.sql.
- El panel admin puede tener varias sesiones abiertas.
- Los cambios importantes deben intentar mantenerse sincronizados entre sesiones cuando corresponda.
- No agregar tablas a realtime sin revisar si realmente hace falta.

## Backup antes de ERP / cambios grandes
- Se realizó un backup general antes de avanzar con el ERP y cambios importantes.
- Ubicación local del backup: C:\Users\Franco\Desktop\BACKUP_ANTES_ERP
- Copia local completa del proyecto: 01_codigo/inkora-next
- Dump SQL de Supabase: 03_supabase/supabase_web_backup.sql
- Copia de scripts SQL del proyecto: 03_supabase/sql_del_proyecto
- Variables de entorno de Vercel: 04_vercel/.env.vercel.backup
- Resumen general: RESUMEN_GENERAL_BACKUP.txt
- La carpeta de backup debe quedar fuera del proyecto inkora-next.
- No subir backups, dumps SQL ni variables de entorno al repo.
- No compartir .env.vercel.backup ni dumps con IA si contienen datos reales o claves.
- Repomix sirve como contexto de código, pero no reemplaza este backup.

## Seguridad
- No subir claves, tokens ni variables sensibles al repo.
- No subir .env reales.
- No subir .env.vercel.backup.
- No subir backups SQL con datos reales.
- No subir dumps de Supabase.
- No subir carpetas de backup.
- No pegar secrets en chats de IA.
- No exponer service_role en frontend.
- No usar claves sensibles en componentes client-side.
- Validar especialmente cambios en Auth, RLS, funciones SQL y policies antes de ejecutar en Supabase.

## Repomix
- Repomix sirve para generar una foto del código para IA.
- No editar el archivo Repomix manualmente.
- Primero actualizar archivos reales del repo.
- Luego generar un nuevo Repomix.
- Verificar que Repomix no incluya backups, dumps, .env, variables ni archivos sensibles.
- Repomix sirve como contexto para IA, pero no reemplaza el backup real del proyecto.

## Recomendación antes de cambios importantes
- Ejecutar build: CI=true npm run build
- Revisar Git: git status
- Confirmar que no se van a commitear archivos sensibles.
- Confirmar que el backup sigue fuera del proyecto.
- Hacer commit claro.
- Pushear a GitHub.
- Verificar deploy en Vercel.
- Si los cambios ya fueron validados y no se depende solo del deploy automatico, ejecutar deploy manual a produccion: vercel.cmd deploy --prod --yes.
