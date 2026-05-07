-- Agrega columna info_tags a la tabla products
-- Cada tag tiene: { id: string, title: string, description: string }
-- El orden del array define el orden de visualización

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS info_tags JSONB DEFAULT '[]'::jsonb;
