-- INKORA - Politicas RLS para la pestaña Produccion
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

ALTER TABLE public.production_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_stock_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins_read_production_stock" ON public.production_stock;
DROP POLICY IF EXISTS "admins_insert_production_stock" ON public.production_stock;
DROP POLICY IF EXISTS "admins_update_production_stock" ON public.production_stock;
DROP POLICY IF EXISTS "admins_delete_production_stock" ON public.production_stock;

CREATE POLICY "admins_read_production_stock"
  ON public.production_stock FOR SELECT
  USING (public.is_admin());

CREATE POLICY "admins_insert_production_stock"
  ON public.production_stock FOR INSERT
  WITH CHECK (public.is_admin());

CREATE POLICY "admins_update_production_stock"
  ON public.production_stock FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "admins_delete_production_stock"
  ON public.production_stock FOR DELETE
  USING (public.is_admin());

DROP POLICY IF EXISTS "admins_read_production_status" ON public.production_status;
DROP POLICY IF EXISTS "admins_insert_production_status" ON public.production_status;
DROP POLICY IF EXISTS "admins_update_production_status" ON public.production_status;
DROP POLICY IF EXISTS "admins_delete_production_status" ON public.production_status;

CREATE POLICY "admins_read_production_status"
  ON public.production_status FOR SELECT
  USING (public.is_admin());

CREATE POLICY "admins_insert_production_status"
  ON public.production_status FOR INSERT
  WITH CHECK (public.is_admin());

CREATE POLICY "admins_update_production_status"
  ON public.production_status FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "admins_delete_production_status"
  ON public.production_status FOR DELETE
  USING (public.is_admin());

DROP POLICY IF EXISTS "admins_read_production_stock_log" ON public.production_stock_log;
DROP POLICY IF EXISTS "admins_insert_production_stock_log" ON public.production_stock_log;
DROP POLICY IF EXISTS "admins_update_production_stock_log" ON public.production_stock_log;
DROP POLICY IF EXISTS "admins_delete_production_stock_log" ON public.production_stock_log;

CREATE POLICY "admins_read_production_stock_log"
  ON public.production_stock_log FOR SELECT
  USING (public.is_admin());

CREATE POLICY "admins_insert_production_stock_log"
  ON public.production_stock_log FOR INSERT
  WITH CHECK (public.is_admin());

CREATE POLICY "admins_update_production_stock_log"
  ON public.production_stock_log FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "admins_delete_production_stock_log"
  ON public.production_stock_log FOR DELETE
  USING (public.is_admin());
