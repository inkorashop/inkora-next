-- INKORA - Verificacion y habilitacion de Realtime para produccion
-- Ejecutar en Supabase SQL Editor si las cantidades no se actualizan entre PCs.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'production_order_tasks'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.production_order_tasks;
  END IF;
END $$;

SELECT
  pubname,
  schemaname,
  tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
  AND schemaname = 'public'
  AND tablename IN ('production_order_tasks', 'production_operators')
ORDER BY tablename;
