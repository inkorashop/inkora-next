-- INKORA - Admin realtime sync
-- Ejecutar en Supabase SQL Editor.
-- Habilita Postgres Changes para que todos los paneles admin abiertos
-- refresquen automaticamente cuando otra PC modifica datos.

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.admins
    WHERE email = auth.jwt() ->> 'email'
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated;

DROP POLICY IF EXISTS "admins_read_profiles" ON public.profiles;
CREATE POLICY "admins_read_profiles"
  ON public.profiles FOR SELECT
  USING (public.is_admin());

CREATE TABLE IF NOT EXISTS public.admin_presence (
  session_id text PRIMARY KEY,
  email text NOT NULL,
  tab text,
  user_agent text,
  updated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_presence_email_idx
  ON public.admin_presence (email);

CREATE INDEX IF NOT EXISTS admin_presence_updated_at_idx
  ON public.admin_presence (updated_at DESC);

ALTER TABLE public.admin_presence ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_presence TO authenticated;

DROP POLICY IF EXISTS "admins_read_admin_presence" ON public.admin_presence;
DROP POLICY IF EXISTS "admins_insert_admin_presence" ON public.admin_presence;
DROP POLICY IF EXISTS "admins_update_admin_presence" ON public.admin_presence;
DROP POLICY IF EXISTS "admins_delete_admin_presence" ON public.admin_presence;

CREATE POLICY "admins_read_admin_presence"
  ON public.admin_presence FOR SELECT
  USING (public.is_admin());

CREATE POLICY "admins_insert_admin_presence"
  ON public.admin_presence FOR INSERT
  WITH CHECK (public.is_admin());

CREATE POLICY "admins_update_admin_presence"
  ON public.admin_presence FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "admins_delete_admin_presence"
  ON public.admin_presence FOR DELETE
  USING (public.is_admin());

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication
    WHERE pubname = 'supabase_realtime'
  ) THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;

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
    ('products'),
    ('designs'),
    ('localities'),
    ('price_tiers'),
    ('admins'),
    ('orders'),
    ('settings'),
    ('sellers'),
    ('profiles'),
    ('click_events'),
    ('user_activity_events'),
    ('user_presence'),
    ('production_stock'),
    ('production_status'),
    ('production_stock_log'),
    ('admin_presence'),
    ('admin_activity_events'),
    ('admin_version_snapshots')
) AS realtime_tables(table_name);

DROP FUNCTION IF EXISTS public.add_table_to_supabase_realtime(text);
