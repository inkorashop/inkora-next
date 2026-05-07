# INKORA - Contexto del proyecto

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