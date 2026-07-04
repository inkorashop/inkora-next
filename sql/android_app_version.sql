-- INKORA - Version de la app nativa de Android (WebView + burbuja flotante)
-- Ejecutar en Supabase SQL Editor. La app chequea /api/app-version (lee esta
-- tabla) para saber si hay una version nueva del cascaron para descargar.
--
-- Cada vez que se compile una nueva version del APK (android-app/):
--   1. Subir el .apk a algun storage publico (ej. bucket "assets" de Supabase Storage).
--   2. Actualizar estas 3 filas con el nuevo versionCode/versionName/URL.

INSERT INTO public.settings (key, value)
VALUES
  ('android_app_version_code', '1'),
  ('android_app_version_name', '1.0.0'),
  ('android_app_apk_url', '')
ON CONFLICT (key) DO NOTHING;
