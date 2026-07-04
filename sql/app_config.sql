-- Global app config key/value store.
-- Used for settings that need to be shared across devices.
-- Run in Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS public.app_config (
  key   text PRIMARY KEY,
  value text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Solo admin puede leer/escribir directo via RLS. Ningun codigo cliente
-- consulta esta tabla directamente (ni admin ni operarios): todo pasa por
-- /api/bridge-config, que usa la service_role key (bypassea RLS) y valida
-- ahi mismo que sea admin u operario activo. Por eso ya no hace falta una
-- policy de lectura abierta a cualquier autenticado, que hoy exponia
-- bridge_token a cualquier cliente logueado sin necesidad real.
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_all" ON public.app_config;
DROP POLICY IF EXISTS "authenticated_read" ON public.app_config;

CREATE POLICY "admin_all" ON public.app_config
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Seed rows (empty by default; saved when user connects).
INSERT INTO public.app_config (key, value)
VALUES ('bridge_token', ''), ('bridge_url', '')
ON CONFLICT (key) DO NOTHING;
