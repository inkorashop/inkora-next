-- Agrega columna design_formats a la tabla products
-- Ejecutar en Supabase > SQL Editor

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS design_formats jsonb DEFAULT '["jpg","png"]'::jsonb;

-- Productos que ya eran 3D (allow_glb = true) pasan a tener 3mf como formato
UPDATE products
SET design_formats = '["3mf"]'::jsonb
WHERE (allow_3d = true OR allow_glb = true)
  AND (
    design_formats IS NULL
    OR design_formats = '["jpg","png"]'::jsonb
    OR design_formats = '[]'::jsonb
  );
