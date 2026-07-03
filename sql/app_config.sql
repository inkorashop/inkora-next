-- Global app config key/value store.
-- Used for settings that need to be shared across devices.
-- Run in Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS public.app_config (
  key   text PRIMARY KEY,
  value text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Admin can read/write. Any authenticated user can read.
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_all" ON public.app_config;
DROP POLICY IF EXISTS "authenticated_read" ON public.app_config;

CREATE POLICY "admin_all" ON public.app_config
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "authenticated_read" ON public.app_config
  FOR SELECT TO authenticated
  USING (true);

-- Seed the bridge_token row (empty by default; saved when user connects).
INSERT INTO public.app_config (key, value)
VALUES ('bridge_token', '')
ON CONFLICT (key) DO NOTHING;
