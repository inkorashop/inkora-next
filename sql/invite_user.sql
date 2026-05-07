-- Agrega columnas a profiles para el sistema de invitación
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS admin_set_password text,
  ADD COLUMN IF NOT EXISTS password_changed_by_user boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS registration_source text DEFAULT 'self_email';

-- Trigger: cuando el usuario cambia su contraseña, limpia la clave admin y marca el flag
CREATE OR REPLACE FUNCTION public.handle_auth_password_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.encrypted_password IS DISTINCT FROM NEW.encrypted_password THEN
    UPDATE public.profiles
    SET
      admin_set_password = NULL,
      password_changed_by_user = true
    WHERE id = NEW.id
      AND registration_source = 'admin_invite';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_password_change ON auth.users;
CREATE TRIGGER on_auth_password_change
  AFTER UPDATE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_auth_password_change();

-- Actualiza admin_get_profiles para incluir los nuevos campos
DROP FUNCTION IF EXISTS admin_get_profiles();
CREATE OR REPLACE FUNCTION admin_get_profiles()
RETURNS TABLE (
  id                      uuid,
  email                   text,
  name                    text,
  locality_id             uuid,
  locality_name           text,
  seller_id               uuid,
  send_confirmation_email boolean,
  phone                   text,
  created_at              timestamptz,
  admin_set_password      text,
  password_changed_by_user boolean,
  registration_source     text
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
    COALESCE(p.send_confirmation_email, true) AS send_confirmation_email,
    p.phone,
    p.created_at,
    p.admin_set_password,
    COALESCE(p.password_changed_by_user, false) AS password_changed_by_user,
    COALESCE(
      p.registration_source,
      CASE
        WHEN au.raw_app_meta_data->>'provider' = 'google' THEN 'self_google'
        ELSE 'self_email'
      END
    ) AS registration_source
  FROM profiles p
  LEFT JOIN localities l ON p.locality_id = l.id
  LEFT JOIN auth.users au ON au.id = p.id
  ORDER BY p.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_profiles() TO anon, authenticated;
