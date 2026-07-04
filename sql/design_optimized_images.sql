-- INKORA - Miniaturas optimizadas para diseños
-- Ejecutar en Supabase SQL Editor antes de usar "Optimizar" en Admin > Diseños.
-- Las columnas nuevas guardan copias livianas sin tocar image_url/model_url originales.

ALTER TABLE public.designs
  ADD COLUMN IF NOT EXISTS optimized_image_url text,
  ADD COLUMN IF NOT EXISTS optimized_image_source_url text,
  ADD COLUMN IF NOT EXISTS optimized_image_source_size_kb integer CHECK (optimized_image_source_size_kb IS NULL OR optimized_image_source_size_kb >= 0),
  ADD COLUMN IF NOT EXISTS optimized_image_size_kb integer CHECK (optimized_image_size_kb IS NULL OR optimized_image_size_kb >= 0),
  ADD COLUMN IF NOT EXISTS optimized_image_target_kb integer CHECK (optimized_image_target_kb IS NULL OR optimized_image_target_kb > 0),
  ADD COLUMN IF NOT EXISTS optimized_image_updated_at timestamptz;

CREATE INDEX IF NOT EXISTS designs_optimized_image_updated_at_idx
  ON public.designs (optimized_image_updated_at);
