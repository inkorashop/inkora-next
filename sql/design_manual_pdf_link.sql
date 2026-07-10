-- INKORA - Vinculo manual de PDF por diseno (Diseños > icono de link)
--
-- El emparejamiento automatico (fuzzy match por nombre contra los PDFs
-- escaneados por el Bridge) a veces falla o elige el archivo equivocado.
-- Esto agrega la posibilidad de fijar a mano, por diseño, exactamente que
-- archivo (de los ya escaneados por el Bridge, via /pdf-catalog) le
-- corresponde. Se guarda en el propio diseño (no por PC/operario), asi que
-- Produccion —que ya usa el mismo estado designPdfMatches compartido con
-- Diseños— lo hereda automaticamente sin tocar codigo de Produccion.
--
-- Ejecutar en Supabase SQL Editor.

ALTER TABLE public.designs
  ADD COLUMN IF NOT EXISTS manual_pdf_root_name text,
  ADD COLUMN IF NOT EXISTS manual_pdf_relative_path text,
  ADD COLUMN IF NOT EXISTS manual_pdf_file_name text;
