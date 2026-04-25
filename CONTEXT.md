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
- Bucket storage: assets (carpetas: thumbnails, models)
- Tabla designs tiene columna model_url (nullable) para archivos GLB

## WhatsApp
- Número: 5493765211017

## Deploy
- git add . && git commit -m "mensaje" && git push
- Vercel detecta el push y deploya automáticamente
- Antes de pushear: CI=true npm run build

## Tablas principales Supabase
- products, designs, orders, localities, price_tiers, profiles, admins, carts

## Notas importantes
- Google OAuth configurado en Supabase
- Admin usa tabla "admins" para verificar acceso
- Precios escalonados por localidad en price_tiers
- "Sin localidad" es una localidad real en la tabla localities
- Visor 3D implementado con Three.js (componente ModelViewer) para diseños con model_url
- Productos con allow_glb=true permiten subir archivos GLB en lugar de imagen
- Emails via Resend: al confirmar pedido se envían dos emails automáticos (confirmación al cliente + notificación a INKORA con CSV adjunto)