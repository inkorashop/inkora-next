-- Deja desactivado por defecto el email automatico de confirmacion de pedido.
-- Ejecutar en Supabase SQL Editor si la base ya existe.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS send_confirmation_email boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS seller_id uuid,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS admin_set_password text,
  ADD COLUMN IF NOT EXISTS password_changed_by_user boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS password_changed_at timestamptz,
  ADD COLUMN IF NOT EXISTS password_prompt_dismissed_on date,
  ADD COLUMN IF NOT EXISTS password_prompt_manual_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS password_prompt_manual_seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS registration_source text DEFAULT 'self_email',
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by text,
  ADD COLUMN IF NOT EXISTS deleted_reason text;

ALTER TABLE public.profiles
  ALTER COLUMN send_confirmation_email SET DEFAULT false;

UPDATE public.profiles
SET send_confirmation_email = false
WHERE send_confirmation_email IS NULL;

-- Mantiene admin_get_profiles compatible con el panel actual.
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
