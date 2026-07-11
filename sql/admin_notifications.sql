-- ============================================================
-- INKORA - Notificaciones internas y aviso de cambio de contraseña
-- Ejecutar en Supabase SQL Editor.
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS admin_set_password text,
  ADD COLUMN IF NOT EXISTS password_changed_by_user boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS registration_source text DEFAULT 'self_email',
  ADD COLUMN IF NOT EXISTS send_confirmation_email boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS seller_id uuid,
  ADD COLUMN IF NOT EXISTS password_changed_at timestamptz,
  ADD COLUMN IF NOT EXISTS password_prompt_dismissed_on date,
  ADD COLUMN IF NOT EXISTS password_prompt_manual_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS password_prompt_manual_seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS admin_password_reset_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by text,
  ADD COLUMN IF NOT EXISTS deleted_reason text;

UPDATE public.profiles
SET password_changed_by_user = false
WHERE password_changed_by_user IS NULL;

ALTER TABLE public.profiles
  ALTER COLUMN send_confirmation_email SET DEFAULT false;

UPDATE public.profiles
SET send_confirmation_email = false
WHERE send_confirmation_email IS NULL;

INSERT INTO public.settings (key, value)
VALUES
  ('require_email_confirmation', 'false'),
  ('password_change_prompt_enabled', 'true'),
  ('password_change_prompt_delay_days', '14')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    email,
    name,
    phone,
    registration_source,
    password_changed_by_user,
    send_confirmation_email
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NULLIF(NEW.raw_user_meta_data->>'phone', ''),
    CASE
      WHEN NEW.raw_app_meta_data->>'provider' = 'google' THEN 'self_google'
      ELSE 'self_email'
    END,
    false,
    false
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

CREATE TABLE IF NOT EXISTS public.admin_notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type        text NOT NULL,
  title       text NOT NULL,
  body        text,
  user_id     uuid,
  order_id    text,
  metadata    jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_notifications_all" ON public.admin_notifications;
CREATE POLICY "admin_notifications_all"
  ON public.admin_notifications
  FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS admin_notifications_created_at_idx
  ON public.admin_notifications (created_at DESC);

CREATE INDEX IF NOT EXISTS admin_notifications_type_idx
  ON public.admin_notifications (type, created_at DESC);

CREATE OR REPLACE FUNCTION public.notify_admin_order_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_items jsonb := to_jsonb(NEW.items);
  v_items_count integer := 0;
BEGIN
  IF jsonb_typeof(v_items) = 'array' THEN
    v_items_count := jsonb_array_length(v_items);
  END IF;

  INSERT INTO public.admin_notifications (
    type,
    title,
    body,
    order_id,
    metadata,
    created_at
  )
  VALUES (
    'order_created',
    trim('Nuevo pedido ' || COALESCE(NEW.order_code, '')),
    COALESCE(NEW.customer_name, 'Cliente') || ' · ' || v_items_count || ' ítems' ||
      CASE WHEN NEW.total IS NOT NULL AND NEW.total > 0 THEN ' · $' || NEW.total::text ELSE '' END,
    NEW.id::text,
    jsonb_build_object(
      'order_code', NEW.order_code,
      'customer_name', NEW.customer_name,
      'customer_email', NEW.customer_email,
      'customer_phone', NEW.customer_phone,
      'items_count', v_items_count,
      'items', v_items,
      'total', NEW.total,
      'notes', NEW.notes
    ),
    COALESCE(NEW.created_at, now())
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_order_admin_notification ON public.orders;
CREATE TRIGGER on_order_admin_notification
  AFTER INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_admin_order_created();

CREATE OR REPLACE FUNCTION public.handle_auth_password_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile record;
BEGIN
  IF OLD.encrypted_password IS DISTINCT FROM NEW.encrypted_password THEN
    SELECT
      id,
      email,
      name,
      registration_source,
      admin_password_reset_started_at,
      deleted_at
    INTO v_profile
    FROM public.profiles
    WHERE id = NEW.id;

    IF v_profile.id IS NULL OR v_profile.deleted_at IS NOT NULL THEN
      RETURN NEW;
    END IF;

    IF v_profile.admin_password_reset_started_at IS NOT NULL
      AND v_profile.admin_password_reset_started_at >= now() - interval '2 minutes'
    THEN
      UPDATE public.profiles
      SET admin_password_reset_started_at = NULL
      WHERE id = NEW.id;

      RETURN NEW;
    END IF;

    UPDATE public.profiles
    SET
      admin_set_password = CASE
        WHEN COALESCE(v_profile.registration_source, '') = 'admin_invite' THEN NULL
        ELSE admin_set_password
      END,
      password_changed_by_user = true,
      password_changed_at = now(),
      admin_password_reset_started_at = NULL,
      password_prompt_manual_seen_at = CASE
        WHEN COALESCE(v_profile.registration_source, '') = 'admin_invite' THEN now()
        ELSE password_prompt_manual_seen_at
      END
    WHERE id = NEW.id;

    INSERT INTO public.admin_notifications (
      type,
      title,
      body,
      user_id,
      metadata,
      created_at
    )
    VALUES (
      'password_changed',
      'Cambio de contraseña',
      COALESCE(v_profile.name, split_part(NEW.email, '@', 1), 'Usuario') || ' cambió su contraseña',
      NEW.id,
      jsonb_build_object(
        'user_email', COALESCE(v_profile.email, NEW.email),
        'user_name', v_profile.name,
        'registration_source', v_profile.registration_source
      ),
      now()
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_password_change ON auth.users;
CREATE TRIGGER on_auth_password_change
  AFTER UPDATE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_auth_password_change();

DROP FUNCTION IF EXISTS admin_get_profiles();
CREATE OR REPLACE FUNCTION admin_get_profiles()
RETURNS TABLE (
  id                                      uuid,
  email                                   text,
  name                                    text,
  locality_id                             uuid,
  locality_name                           text,
  seller_id                               uuid,
  send_confirmation_email                 boolean,
  phone                                   text,
  created_at                              timestamptz,
  admin_set_password                      text,
  password_changed_by_user                boolean,
  password_changed_at                     timestamptz,
  password_prompt_dismissed_on            date,
  password_prompt_manual_requested_at     timestamptz,
  password_prompt_manual_seen_at          timestamptz,
  registration_source                     text,
  deleted_at                              timestamptz,
  deleted_by                              text,
  deleted_reason                          text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id,
    p.email,
    p.name,
    p.locality_id,
    l.name AS locality_name,
    p.seller_id,
    COALESCE(p.send_confirmation_email, false) AS send_confirmation_email,
    p.phone,
    p.created_at,
    p.admin_set_password,
    COALESCE(p.password_changed_by_user, false) AS password_changed_by_user,
    p.password_changed_at,
    p.password_prompt_dismissed_on,
    p.password_prompt_manual_requested_at,
    p.password_prompt_manual_seen_at,
    COALESCE(
      p.registration_source,
      CASE
        WHEN au.raw_app_meta_data->>'provider' = 'google' THEN 'self_google'
        ELSE 'self_email'
      END
    ) AS registration_source,
    p.deleted_at,
    p.deleted_by,
    p.deleted_reason
  FROM public.profiles p
  LEFT JOIN public.localities l ON p.locality_id = l.id
  LEFT JOIN auth.users au ON au.id = p.id
  ORDER BY p.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_profiles() TO anon, authenticated;
