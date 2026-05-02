-- INKORA - Historial de versiones del admin
-- Ejecutar en Supabase SQL Editor.
-- Guarda snapshots de datos criticos cada 1 hora solo si hubo cambios.
-- No guarda archivos fisicos; solo datos, URLs y metadatos.

CREATE TABLE IF NOT EXISTS public.admin_version_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'auto')),
  label text,
  content_hash text NOT NULL,
  counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  data jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS admin_version_snapshots_created_at_idx
  ON public.admin_version_snapshots (created_at DESC);

CREATE INDEX IF NOT EXISTS admin_version_snapshots_content_hash_idx
  ON public.admin_version_snapshots (content_hash);

ALTER TABLE public.admin_version_snapshots ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, DELETE ON public.admin_version_snapshots TO authenticated;

DROP POLICY IF EXISTS "admins_read_admin_version_snapshots" ON public.admin_version_snapshots;
DROP POLICY IF EXISTS "admins_insert_admin_version_snapshots" ON public.admin_version_snapshots;
DROP POLICY IF EXISTS "admins_delete_admin_version_snapshots" ON public.admin_version_snapshots;

CREATE POLICY "admins_read_admin_version_snapshots"
  ON public.admin_version_snapshots FOR SELECT
  USING (public.is_admin());

CREATE POLICY "admins_insert_admin_version_snapshots"
  ON public.admin_version_snapshots FOR INSERT
  WITH CHECK (public.is_admin());

CREATE POLICY "admins_delete_admin_version_snapshots"
  ON public.admin_version_snapshots FOR DELETE
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
    ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_version_snapshots;
  EXCEPTION
    WHEN duplicate_object THEN
      RAISE NOTICE 'Tabla public.admin_version_snapshots ya estaba en supabase_realtime.';
  END;
END $$;
