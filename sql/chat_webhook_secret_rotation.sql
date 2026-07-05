-- ============================================================
-- INKORA - Rotacion segura del secret del webhook de chat
-- Ejecutar en Supabase SQL Editor cuando se cambie CHAT_WEBHOOK_SECRET.
--
-- Pasos:
-- 1. Generar un secret nuevo fuera del repo.
-- 2. Guardar ese mismo valor en Vercel como CHAT_WEBHOOK_SECRET (Production).
-- 3. En este archivo, SOLO en el SQL Editor, reemplazar:
--    __REEMPLAZAR_POR_CHAT_WEBHOOK_SECRET__
--    por el valor nuevo. No commitear nunca el valor real.
-- 4. Ejecutar este script completo.
-- ============================================================

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

DO $$
DECLARE
  v_secret text := '__REEMPLAZAR_POR_CHAT_WEBHOOK_SECRET__';
BEGIN
  IF v_secret = '__REEMPLAZAR_POR_CHAT_WEBHOOK_SECRET__'
     OR length(trim(v_secret)) < 32 THEN
    RAISE EXCEPTION 'Reemplazar __REEMPLAZAR_POR_CHAT_WEBHOOK_SECRET__ por el secret real antes de ejecutar.';
  END IF;

  INSERT INTO private.app_secrets (key, value, updated_at)
  VALUES ('chat_webhook_secret', v_secret, now())
  ON CONFLICT (key)
  DO UPDATE SET value = EXCLUDED.value, updated_at = now();
END $$;

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

SELECT
  true AS secret_configurado,
  length(value) AS secret_largo,
  updated_at
FROM private.app_secrets
WHERE key = 'chat_webhook_secret';
