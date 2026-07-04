-- INKORA - Habilita Realtime para price_tiers
-- Ejecutar en Supabase SQL Editor. Sin esto, la suscripcion postgres_changes
-- del catalogo (app/catalogo/page.js) no recibe eventos aunque el codigo este bien.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'price_tiers'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.price_tiers;
  END IF;
END $$;

SELECT
  pubname,
  schemaname,
  tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
  AND schemaname = 'public'
  AND tablename = 'price_tiers';
