-- ============================================================
-- INKORA - Chat interno del panel admin
-- Ejecutar en Supabase SQL Editor antes de usar la pestana Chat.
-- Ver CHAT_FEATURE_PLAN.md para el detalle completo del plan.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.chat_channels (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  type        text NOT NULL DEFAULT 'group' CHECK (type IN ('main', 'group')),
  created_by  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.chat_channel_members (
  channel_id  uuid NOT NULL REFERENCES public.chat_channels(id) ON DELETE CASCADE,
  email       text NOT NULL,
  added_by    text,
  joined_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (channel_id, email)
);

-- sender_email null = mensaje de sistema (notificacion interna espejada, ver trigger abajo)
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id         uuid NOT NULL REFERENCES public.chat_channels(id) ON DELETE CASCADE,
  sender_email       text,
  body               text,
  reply_to_id        uuid REFERENCES public.chat_messages(id) ON DELETE SET NULL,
  reference          jsonb,
  image_url          text,
  image_expires_at   timestamptz,
  edited_at          timestamptz,
  deleted_at         timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now()
);

-- Se puebla al enviar el mensaje (no se parsea @usuario recien al mostrar).
-- Preparado para un futuro push notification: "que menciones tiene pendientes este usuario".
CREATE TABLE IF NOT EXISTS public.chat_message_mentions (
  message_id       uuid NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  mentioned_email  text NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, mentioned_email)
);

CREATE INDEX IF NOT EXISTS chat_messages_channel_created_idx
  ON public.chat_messages (channel_id, created_at DESC);

CREATE INDEX IF NOT EXISTS chat_messages_image_expires_idx
  ON public.chat_messages (image_expires_at)
  WHERE image_expires_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS chat_channel_members_email_idx
  ON public.chat_channel_members (email);

CREATE INDEX IF NOT EXISTS chat_message_mentions_email_idx
  ON public.chat_message_mentions (mentioned_email);

-- RLS liviana a proposito: uso interno, sin datos sensibles de la empresa
-- (mismo criterio que ya usa admin_notifications en este proyecto).
ALTER TABLE public.chat_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_channel_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_message_mentions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "chat_channels_all" ON public.chat_channels;
CREATE POLICY "chat_channels_all" ON public.chat_channels FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "chat_channel_members_all" ON public.chat_channel_members;
CREATE POLICY "chat_channel_members_all" ON public.chat_channel_members FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "chat_messages_all" ON public.chat_messages;
CREATE POLICY "chat_messages_all" ON public.chat_messages FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "chat_message_mentions_all" ON public.chat_message_mentions;
CREATE POLICY "chat_message_mentions_all" ON public.chat_message_mentions FOR ALL USING (true) WITH CHECK (true);

-- Canal principal "General": se crea una sola vez, con todos los admins y
-- operadores de produccion ya agregados como miembros. Idempotente: se puede
-- volver a correr este script sin duplicar el canal ni los miembros.
DO $$
DECLARE
  v_main_channel_id uuid;
BEGIN
  SELECT id INTO v_main_channel_id FROM public.chat_channels WHERE type = 'main' LIMIT 1;

  IF v_main_channel_id IS NULL THEN
    INSERT INTO public.chat_channels (name, type, created_by)
    VALUES ('General', 'main', 'inkorashop@gmail.com')
    RETURNING id INTO v_main_channel_id;
  END IF;

  INSERT INTO public.chat_channel_members (channel_id, email, added_by)
  SELECT v_main_channel_id, a.email, 'inkorashop@gmail.com'
  FROM public.admins a
  WHERE a.email IS NOT NULL
  ON CONFLICT (channel_id, email) DO NOTHING;

  INSERT INTO public.chat_channel_members (channel_id, email, added_by)
  SELECT v_main_channel_id, o.email, 'inkorashop@gmail.com'
  FROM public.production_operators o
  WHERE o.email IS NOT NULL
  ON CONFLICT (channel_id, email) DO NOTHING;
END $$;

-- Espeja cada notificacion interna (pedido nuevo, cambio de contraseña) como
-- un mensaje normal en el canal "General" — se puede responder o clickear
-- igual que cualquier otro mensaje del chat, sin sistema paralelo.
CREATE OR REPLACE FUNCTION public.mirror_admin_notification_to_chat()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_channel_id uuid;
  v_reference jsonb;
BEGIN
  SELECT id INTO v_channel_id FROM public.chat_channels WHERE type = 'main' LIMIT 1;
  IF v_channel_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_reference := CASE
    WHEN NEW.order_id IS NOT NULL THEN
      jsonb_build_object('type', 'order', 'id', NEW.order_id, 'label', COALESCE(NEW.metadata->>'order_code', 'Pedido'))
    ELSE NULL
  END;

  INSERT INTO public.chat_messages (channel_id, sender_email, body, reference, created_at)
  VALUES (
    v_channel_id,
    NULL,
    trim(both E'\n' from COALESCE(NEW.title, '') || CASE WHEN NEW.body IS NOT NULL AND NEW.body <> '' THEN E'\n' || NEW.body ELSE '' END),
    v_reference,
    COALESCE(NEW.created_at, now())
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_admin_notification_to_chat ON public.admin_notifications;
CREATE TRIGGER on_admin_notification_to_chat
  AFTER INSERT ON public.admin_notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.mirror_admin_notification_to_chat();

-- Realtime para las tablas nuevas del chat.
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
FROM (
  VALUES
    ('chat_channels'),
    ('chat_channel_members'),
    ('chat_messages'),
    ('chat_message_mentions')
) AS realtime_tables(table_name);

DROP FUNCTION IF EXISTS public.add_table_to_supabase_realtime(text);
