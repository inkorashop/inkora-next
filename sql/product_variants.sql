-- INKORA - Variantes de productos
-- Ejecutar en Supabase SQL Editor.
-- Cada variante es una fila de products con configuracion, categorias y escalas propias.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS parent_product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS variant_name text;

CREATE INDEX IF NOT EXISTS products_parent_product_id_idx
  ON public.products (parent_product_id);

CREATE INDEX IF NOT EXISTS products_variant_name_idx
  ON public.products (variant_name);

COMMENT ON COLUMN public.products.parent_product_id IS
  'Si tiene valor, este producto es una variante del producto padre.';

COMMENT ON COLUMN public.products.variant_name IS
  'Nombre visible de la variante dentro del producto padre.';
