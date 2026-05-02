-- INKORA - Actividad del panel admin
-- Ejecutar en Supabase SQL Editor.
-- Registra eventos livianos del panel, como cambios de pestaña por admin.

CREATE TABLE IF NOT EXISTS public.admin_activity_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  session_id text NOT NULL,
  email text NOT NULL,
  tab text,
  event_type text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS admin_activity_events_created_at_idx
  ON public.admin_activity_events (created_at DESC);

CREATE INDEX IF NOT EXISTS admin_activity_events_email_idx
  ON public.admin_activity_events (email);

CREATE INDEX IF NOT EXISTS admin_activity_events_session_id_idx
  ON public.admin_activity_events (session_id);

ALTER TABLE public.admin_activity_events ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, DELETE ON public.admin_activity_events TO authenticated;

DROP POLICY IF EXISTS "admins_read_admin_activity_events" ON public.admin_activity_events;
DROP POLICY IF EXISTS "admins_insert_admin_activity_events" ON public.admin_activity_events;
DROP POLICY IF EXISTS "admins_delete_admin_activity_events" ON public.admin_activity_events;

CREATE POLICY "admins_read_admin_activity_events"
  ON public.admin_activity_events FOR SELECT
  USING (public.is_admin());

CREATE POLICY "admins_insert_admin_activity_events"
  ON public.admin_activity_events FOR INSERT
  WITH CHECK (public.is_admin());

CREATE POLICY "admins_delete_admin_activity_events"
  ON public.admin_activity_events FOR DELETE
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

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_activity_events;
  EXCEPTION
    WHEN duplicate_object THEN
      RAISE NOTICE 'Tabla public.admin_activity_events ya estaba en supabase_realtime.';
  END;
END $$;
