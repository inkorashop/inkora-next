-- ============================================================
-- INKORA - Notificaciones push del chat interno
-- Ejecutar en Supabase SQL Editor despues de sql/chat.sql.
-- ============================================================

-- Suscripciones push (una fila por navegador/dispositivo suscripto).
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email       text NOT NULL,
  endpoint    text NOT NULL UNIQUE,
  p256dh      text NOT NULL,
  auth        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS push_subscriptions_email_idx
  ON public.push_subscriptions (email);

-- Preferencia de notificacion por canal, por usuario: 'none' (todo normal),
-- 'mute_sound' (se muestra sin sonido) o 'mute_all' (no se muestra nada).
-- Tambien centraliza last_read_at server-side (hoy solo vive en localStorage).
CREATE TABLE IF NOT EXISTS public.chat_channel_member_settings (
  channel_id    uuid NOT NULL REFERENCES public.chat_channels(id) ON DELETE CASCADE,
  email         text NOT NULL,
  mute_level    text NOT NULL DEFAULT 'none' CHECK (mute_level IN ('none', 'mute_sound', 'mute_all')),
  last_read_at  timestamptz,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (channel_id, email)
);

-- RLS liviana a proposito, mismo criterio que el resto de las tablas de chat.
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_channel_member_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "push_subscriptions_all" ON public.push_subscriptions;
CREATE POLICY "push_subscriptions_all" ON public.push_subscriptions FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "chat_channel_member_settings_all" ON public.chat_channel_member_settings;
CREATE POLICY "chat_channel_member_settings_all" ON public.chat_channel_member_settings FOR ALL USING (true) WITH CHECK (true);

-- Dispara un webhook HTTP por cada mensaje nuevo (via pg_net, la misma
-- extension que usa el feature "Database Webhooks" del dashboard de
-- Supabase). El endpoint valida CHAT_WEBHOOK_SECRET y manda los push reales.
--
-- Importante: el secret NO debe quedar hardcodeado en este archivo.
-- Configurarlo en Supabase con `sql/chat_webhook_secret_rotation.sql`.
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE SCHEMA IF NOT EXISTS private;

CREATE TABLE IF NOT EXISTS private.app_secrets (
  key        text PRIMARY KEY,
  value      text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE private.app_secrets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA private FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.notify_chat_message_webhook()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_webhook_secret text;
BEGIN
  SELECT NULLIF(value, '')
  INTO v_webhook_secret
  FROM private.app_secrets
  WHERE key = 'chat_webhook_secret';

  IF v_webhook_secret IS NULL THEN
    RAISE WARNING 'Falta configurar private.app_secrets.chat_webhook_secret; se omite webhook de chat.';
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := 'https://www.inkora.com.ar/api/webhooks/chat-message-created',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', v_webhook_secret
    ),
    body := jsonb_build_object('record', to_jsonb(NEW))
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_chat_message_created_notify ON public.chat_messages;
CREATE TRIGGER on_chat_message_created_notify
  AFTER INSERT ON public.chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_chat_message_webhook();

-- Realtime para la tabla de settings (para que el toggle de silenciar se
-- refleje al instante si el mismo usuario tiene el chat abierto en 2 lados).
CREATE OR REPLACE FUNCTION public.add_table_to_supabase_realtime(table_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  table_regclass regclass;
BEGIN
  table_regclass := to_regclass('public.' || quote_ident(table_name));

  IF table_regclass IS NULL THEN
    RAISE NOTICE 'Tabla public.% no existe, se omite realtime.', table_name;
    RETURN;
  END IF;

  BEGIN
    EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %s', table_regclass);
  EXCEPTION
    WHEN duplicate_object THEN
      RAISE NOTICE 'Tabla public.% ya estaba en supabase_realtime.', table_name;
  END;
END;
$$;

SELECT public.add_table_to_supabase_realtime(table_name)
FROM (VALUES ('chat_channel_member_settings')) AS realtime_tables(table_name);

DROP FUNCTION IF EXISTS public.add_table_to_supabase_realtime(text);
