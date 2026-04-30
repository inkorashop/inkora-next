-- INKORA - Behavioral activity tracking
-- Ejecutar en Supabase SQL Editor.

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

CREATE TABLE IF NOT EXISTS public.user_activity_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),

  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id text NOT NULL,
  is_anonymous boolean DEFAULT true,

  user_email text,
  user_name text,

  event_type text NOT NULL,
  metadata jsonb DEFAULT '{}',

  page text,
  device_type text
);

CREATE INDEX IF NOT EXISTS user_activity_events_session_id_idx
  ON public.user_activity_events (session_id);

CREATE INDEX IF NOT EXISTS user_activity_events_user_id_idx
  ON public.user_activity_events (user_id);

CREATE INDEX IF NOT EXISTS user_activity_events_event_type_idx
  ON public.user_activity_events (event_type);

CREATE INDEX IF NOT EXISTS user_activity_events_created_at_idx
  ON public.user_activity_events (created_at DESC);

CREATE INDEX IF NOT EXISTS user_activity_events_is_anonymous_idx
  ON public.user_activity_events (is_anonymous);

ALTER TABLE public.user_activity_events ENABLE ROW LEVEL SECURITY;

GRANT INSERT ON public.user_activity_events TO anon, authenticated;
GRANT SELECT ON public.user_activity_events TO authenticated;

DROP POLICY IF EXISTS "Anyone can insert activity" ON public.user_activity_events;
DROP POLICY IF EXISTS "Admins can read activity" ON public.user_activity_events;

CREATE POLICY "Anyone can insert activity"
  ON public.user_activity_events FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Admins can read activity"
  ON public.user_activity_events FOR SELECT
  USING (public.is_admin());
