-- INKORA - Asignacion de escalas de precio por cliente y producto
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

ALTER TABLE public.localities
  ADD COLUMN IF NOT EXISTS sort_order integer,
  ADD COLUMN IF NOT EXISTS seller_id uuid REFERENCES public.sellers(id) ON DELETE SET NULL;

UPDATE public.localities
SET sort_order = ordered.row_num - 1
FROM (
  SELECT id, row_number() OVER (ORDER BY sort_order NULLS LAST, created_at, id) AS row_num
  FROM public.localities
) AS ordered
WHERE public.localities.id = ordered.id
  AND public.localities.sort_order IS NULL;

CREATE INDEX IF NOT EXISTS localities_sort_order_idx
  ON public.localities (sort_order);

CREATE INDEX IF NOT EXISTS localities_seller_id_idx
  ON public.localities (seller_id);

CREATE OR REPLACE FUNCTION public.admin_clear_profiles_locality(p_locality_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.profiles
  SET locality_id = NULL
  WHERE locality_id = p_locality_id;
$$;

GRANT EXECUTE ON FUNCTION public.admin_clear_profiles_locality(uuid) TO authenticated;

CREATE TABLE IF NOT EXISTS public.user_product_localities (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  locality_id uuid NOT NULL REFERENCES public.localities(id) ON DELETE RESTRICT,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, product_id)
);

CREATE INDEX IF NOT EXISTS user_product_localities_user_id_idx
  ON public.user_product_localities (user_id);

CREATE INDEX IF NOT EXISTS user_product_localities_product_id_idx
  ON public.user_product_localities (product_id);

CREATE INDEX IF NOT EXISTS user_product_localities_locality_id_idx
  ON public.user_product_localities (locality_id);

ALTER TABLE public.user_product_localities ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_product_localities TO authenticated;

DROP POLICY IF EXISTS "users_read_own_product_localities" ON public.user_product_localities;
DROP POLICY IF EXISTS "admins_read_user_product_localities" ON public.user_product_localities;
DROP POLICY IF EXISTS "admins_insert_user_product_localities" ON public.user_product_localities;
DROP POLICY IF EXISTS "admins_update_user_product_localities" ON public.user_product_localities;
DROP POLICY IF EXISTS "admins_delete_user_product_localities" ON public.user_product_localities;

CREATE POLICY "users_read_own_product_localities"
  ON public.user_product_localities FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "admins_read_user_product_localities"
  ON public.user_product_localities FOR SELECT
  USING (public.is_admin());

CREATE POLICY "admins_insert_user_product_localities"
  ON public.user_product_localities FOR INSERT
  WITH CHECK (public.is_admin());

CREATE POLICY "admins_update_user_product_localities"
  ON public.user_product_localities FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "admins_delete_user_product_localities"
  ON public.user_product_localities FOR DELETE
  USING (public.is_admin());

CREATE OR REPLACE FUNCTION public.touch_user_product_localities_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS touch_user_product_localities_updated_at ON public.user_product_localities;
CREATE TRIGGER touch_user_product_localities_updated_at
  BEFORE UPDATE ON public.user_product_localities
  FOR EACH ROW EXECUTE PROCEDURE public.touch_user_product_localities_updated_at();

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
    ALTER PUBLICATION supabase_realtime ADD TABLE public.user_product_localities;
  EXCEPTION
    WHEN duplicate_object THEN
      RAISE NOTICE 'Tabla public.user_product_localities ya estaba en supabase_realtime.';
  END;
END $$;
