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
  INSERT INTO public.profiles (id, email, name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1))
  );
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
  id           uuid,
  email        text,
  name         text,
  locality_id  uuid,
  locality_name text,
  created_at   timestamptz
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
    p.created_at
  FROM profiles p
  LEFT JOIN localities l ON p.locality_id = l.id
  ORDER BY p.created_at DESC;
$$;


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
