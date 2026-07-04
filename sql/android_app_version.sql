-- INKORA - Version de la app nativa de Android (WebView + burbuja flotante)
-- Solo de referencia: estas filas ya se crean/actualizan solas al correr
-- android-app/publish-release.js (sube el .apk a Supabase Storage y hace
-- upsert de estas 3 keys). No hace falta ejecutar este archivo a mano salvo
-- que la tabla settings se haya recreado desde cero.

INSERT INTO public.settings (key, value)
VALUES
  ('android_app_version_code', '1'),
  ('android_app_version_name', '1.0.0'),
  ('android_app_apk_url', '')
ON CONFLICT (key) DO NOTHING;
