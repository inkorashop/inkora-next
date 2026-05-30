-- ============================================================
-- INKORA — Setup SQL
-- Ejecutar en Supabase SQL Editor
-- ============================================================

-- ── LOCALIDADES ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS localities (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name             text NOT NULL,
  price_per_unit   integer NOT NULL DEFAULT 500,
  active           boolean NOT NULL DEFAULT true,
  sort_order       integer,
  seller_id        uuid,
  created_at       timestamptz DEFAULT now()
);

ALTER TABLE localities ENABLE ROW LEVEL SECURITY;

-- Cualquiera puede leer localidades activas
DROP POLICY IF EXISTS "public_read_localities" ON localities;
CREATE POLICY "public_read_localities"
  ON localities FOR SELECT
  USING (active = true);

-- Admin puede gestionar localidades (anon key, panel protegido por contraseña)
DROP POLICY IF EXISTS "admin_all_localities" ON localities;
CREATE POLICY "admin_all_localities"
  ON localities FOR ALL
  USING (true)
  WITH CHECK (true);


-- ── PERFILES ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  id            uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email         text,
  name          text,
  locality_id   uuid REFERENCES localities(id),
  created_at    timestamptz DEFAULT now()
);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS admin_set_password text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS seller_id uuid,
  ADD COLUMN IF NOT EXISTS registration_source text DEFAULT 'self_email',
  ADD COLUMN IF NOT EXISTS password_changed_by_user boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS password_changed_at timestamptz,
  ADD COLUMN IF NOT EXISTS password_prompt_dismissed_on date,
  ADD COLUMN IF NOT EXISTS password_prompt_manual_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS password_prompt_manual_seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS admin_password_reset_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS send_confirmation_email boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by text,
  ADD COLUMN IF NOT EXISTS deleted_reason text;

ALTER TABLE public.profiles
  ALTER COLUMN send_confirmation_email SET DEFAULT false;

UPDATE public.profiles
SET send_confirmation_email = false
WHERE send_confirmation_email IS NULL;

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Cada usuario solo ve y edita su propio perfil
DROP POLICY IF EXISTS "users_select_own_profile" ON profiles;
CREATE POLICY "users_select_own_profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "users_insert_own_profile" ON profiles;
CREATE POLICY "users_insert_own_profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "users_update_own_profile" ON profiles;
CREATE POLICY "users_update_own_profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);


-- ── TRIGGER: crear perfil al registrarse ─────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, phone, registration_source, password_changed_by_user, send_confirmation_email)
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


-- ── RPC ADMIN: listar todos los perfiles ─────────────────────
-- SECURITY DEFINER permite que el anon key llame esta función
-- sin que los usuarios puedan hacer SELECT directo en profiles ajenos
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


-- ── RPC ADMIN: asignar localidad a usuario ───────────────────
DROP FUNCTION IF EXISTS admin_update_user_locality(uuid, uuid);
CREATE OR REPLACE FUNCTION admin_update_user_locality(
  p_user_id    uuid,
  p_locality_id uuid
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE profiles
  SET locality_id = p_locality_id
  WHERE id = p_user_id;
$$;

GRANT EXECUTE ON FUNCTION public.admin_update_user_locality(uuid, uuid) TO anon, authenticated;


-- ── RPC ADMIN: asignar vendedor a usuario ───────────────────
DROP FUNCTION IF EXISTS admin_update_user_seller(uuid, uuid);
CREATE OR REPLACE FUNCTION admin_update_user_seller(
  p_user_id   uuid,
  p_seller_id uuid
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE profiles
  SET seller_id = p_seller_id
  WHERE id = p_user_id;
$$;

GRANT EXECUTE ON FUNCTION public.admin_update_user_seller(uuid, uuid) TO anon, authenticated;


-- ── RPC ADMIN: activar/desactivar email de pedido ────────────
DROP FUNCTION IF EXISTS admin_update_user_confirmation(uuid, boolean);
CREATE OR REPLACE FUNCTION admin_update_user_confirmation(
  p_user_id           uuid,
  p_send_confirmation boolean
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE profiles
  SET send_confirmation_email = COALESCE(p_send_confirmation, false)
  WHERE id = p_user_id;
$$;

GRANT EXECUTE ON FUNCTION public.admin_update_user_confirmation(uuid, boolean) TO anon, authenticated;
