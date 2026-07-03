-- INKORA - Produccion por pedido y operarios
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

CREATE TABLE IF NOT EXISTS public.production_operators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  email text UNIQUE NOT NULL,
  name text NOT NULL,
  phone text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.production_order_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  order_code text,
  order_created_at timestamptz,
  customer_name text,
  customer_email text,
  seller_id uuid,
  design_key text NOT NULL,
  design_id text,
  design_name text NOT NULL,
  product_id text,
  product_name text,
  required_qty integer NOT NULL DEFAULT 0 CHECK (required_qty >= 0),
  produced_qty integer NOT NULL DEFAULT 0 CHECK (produced_qty >= 0),
  waste_qty integer NOT NULL DEFAULT 0 CHECK (waste_qty >= 0),
  note text NOT NULL DEFAULT '',
  operator_id uuid REFERENCES public.production_operators(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, design_key)
);

CREATE INDEX IF NOT EXISTS production_order_tasks_order_id_idx
  ON public.production_order_tasks(order_id);

CREATE INDEX IF NOT EXISTS production_order_tasks_operator_id_idx
  ON public.production_order_tasks(operator_id);

CREATE INDEX IF NOT EXISTS production_order_tasks_design_name_idx
  ON public.production_order_tasks(design_name);

ALTER TABLE public.production_operators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_order_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins_read_production_operators" ON public.production_operators;
DROP POLICY IF EXISTS "admins_insert_production_operators" ON public.production_operators;
DROP POLICY IF EXISTS "admins_update_production_operators" ON public.production_operators;
DROP POLICY IF EXISTS "operators_read_own_operator" ON public.production_operators;

CREATE POLICY "admins_read_production_operators"
  ON public.production_operators FOR SELECT
  USING (public.is_admin());

CREATE POLICY "admins_insert_production_operators"
  ON public.production_operators FOR INSERT
  WITH CHECK (public.is_admin());

CREATE POLICY "admins_update_production_operators"
  ON public.production_operators FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "operators_read_own_operator"
  ON public.production_operators FOR SELECT
  USING (user_id = auth.uid() AND active = true);

DROP POLICY IF EXISTS "admins_read_production_order_tasks" ON public.production_order_tasks;
DROP POLICY IF EXISTS "admins_insert_production_order_tasks" ON public.production_order_tasks;
DROP POLICY IF EXISTS "admins_update_production_order_tasks" ON public.production_order_tasks;
DROP POLICY IF EXISTS "admins_delete_production_order_tasks" ON public.production_order_tasks;
DROP POLICY IF EXISTS "operators_read_assigned_production_order_tasks" ON public.production_order_tasks;

CREATE POLICY "admins_read_production_order_tasks"
  ON public.production_order_tasks FOR SELECT
  USING (public.is_admin());

CREATE POLICY "admins_insert_production_order_tasks"
  ON public.production_order_tasks FOR INSERT
  WITH CHECK (public.is_admin());

CREATE POLICY "admins_update_production_order_tasks"
  ON public.production_order_tasks FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "admins_delete_production_order_tasks"
  ON public.production_order_tasks FOR DELETE
  USING (public.is_admin());

CREATE POLICY "operators_read_assigned_production_order_tasks"
  ON public.production_order_tasks FOR SELECT
  USING (
    operator_id IN (
      SELECT id
      FROM public.production_operators
      WHERE user_id = auth.uid()
        AND active = true
    )
  );

CREATE OR REPLACE FUNCTION public.claim_production_operator()
RETURNS public.production_operators
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text := lower(auth.jwt() ->> 'email');
  v_user_id uuid := auth.uid();
  v_operator public.production_operators%ROWTYPE;
BEGIN
  IF v_user_id IS NULL OR v_email IS NULL OR v_email = '' THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  SELECT *
  INTO v_operator
  FROM public.production_operators
  WHERE lower(email) = v_email
  FOR UPDATE;

  IF NOT FOUND THEN
    IF public.is_admin() THEN
      RETURN NULL;
    END IF;
    RAISE EXCEPTION 'Operario no habilitado';
  END IF;

  IF v_operator.active IS NOT TRUE THEN
    RAISE EXCEPTION 'Operario inactivo';
  END IF;

  IF v_operator.user_id IS NOT NULL AND v_operator.user_id <> v_user_id THEN
    RAISE EXCEPTION 'Este operario ya esta vinculado a otra cuenta';
  END IF;

  IF v_operator.user_id IS NULL THEN
    UPDATE public.production_operators
    SET user_id = v_user_id,
        updated_at = now()
    WHERE id = v_operator.id
    RETURNING * INTO v_operator;
  END IF;

  RETURN v_operator;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_production_operator() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_sync_order_production_tasks(p_order_id uuid)
RETURNS SETOF public.production_order_tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  SELECT *
  INTO v_order
  FROM public.orders
  WHERE id = p_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido no encontrado';
  END IF;

  WITH item_rows AS (
    SELECT
      COALESCE(
        NULLIF(item->>'design_id', ''),
        NULLIF(item->>'designId', ''),
        NULLIF(item->>'id', ''),
        NULLIF(item->>'name', '')
      ) AS design_key,
      COALESCE(NULLIF(item->>'design_id', ''), NULLIF(item->>'designId', ''), NULLIF(item->>'id', '')) AS design_id,
      COALESCE(NULLIF(item->>'name', ''), 'Sin nombre') AS design_name,
      NULLIF(item->>'product_id', '') AS product_id,
      COALESCE(NULLIF(item->>'productName', ''), NULLIF(item->>'product_name', ''), 'Sin producto') AS product_name,
      GREATEST(COALESCE(NULLIF(item->>'qty', '')::integer, 0), 0) AS qty
    FROM jsonb_array_elements(COALESCE(v_order.items::jsonb, '[]'::jsonb)) AS item
  ),
  grouped AS (
    SELECT
      design_key,
      MAX(design_id) AS design_id,
      MAX(design_name) AS design_name,
      MAX(product_id) AS product_id,
      MAX(product_name) AS product_name,
      SUM(qty)::integer AS required_qty
    FROM item_rows
    WHERE design_key IS NOT NULL
      AND qty > 0
    GROUP BY design_key
  ),
  upserted AS (
    INSERT INTO public.production_order_tasks (
      order_id,
      order_code,
      order_created_at,
      customer_name,
      customer_email,
      seller_id,
      design_key,
      design_id,
      design_name,
      product_id,
      product_name,
      required_qty
    )
    SELECT
      v_order.id,
      v_order.order_code,
      v_order.created_at,
      v_order.customer_name,
      v_order.customer_email,
      v_order.seller_id,
      grouped.design_key,
      grouped.design_id,
      grouped.design_name,
      grouped.product_id,
      grouped.product_name,
      grouped.required_qty
    FROM grouped
    ON CONFLICT (order_id, design_key)
    DO UPDATE SET
      order_code = EXCLUDED.order_code,
      order_created_at = EXCLUDED.order_created_at,
      customer_name = EXCLUDED.customer_name,
      customer_email = EXCLUDED.customer_email,
      seller_id = EXCLUDED.seller_id,
      design_id = EXCLUDED.design_id,
      design_name = EXCLUDED.design_name,
      product_id = EXCLUDED.product_id,
      product_name = EXCLUDED.product_name,
      required_qty = EXCLUDED.required_qty,
      updated_at = now()
    RETURNING *
  )
  DELETE FROM public.production_order_tasks t
  WHERE t.order_id = p_order_id
    AND NOT EXISTS (
      SELECT 1
      FROM grouped g
      WHERE g.design_key = t.design_key
    );

  RETURN QUERY
  SELECT *
  FROM public.production_order_tasks
  WHERE order_id = p_order_id
  ORDER BY product_name, design_name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_sync_order_production_tasks(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_assign_order_operator(
  p_order_id uuid,
  p_operator_id uuid
)
RETURNS SETOF public.production_order_tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  IF p_operator_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.production_operators WHERE id = p_operator_id AND active = true
  ) THEN
    RAISE EXCEPTION 'Operario no encontrado o inactivo';
  END IF;

  PERFORM public.admin_sync_order_production_tasks(p_order_id);

  UPDATE public.production_order_tasks
  SET operator_id = p_operator_id,
      updated_at = now()
  WHERE order_id = p_order_id;

  RETURN QUERY
  SELECT *
  FROM public.production_order_tasks
  WHERE order_id = p_order_id
  ORDER BY product_name, design_name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_assign_order_operator(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_production_task_progress(
  p_task_id uuid,
  p_produced_qty integer DEFAULT NULL,
  p_waste_qty integer DEFAULT NULL,
  p_note text DEFAULT NULL,
  p_printed_qty integer DEFAULT NULL
)
RETURNS public.production_order_tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task public.production_order_tasks%ROWTYPE;
  v_next_produced integer;
  v_next_waste integer;
  v_next_printed integer;
  v_delta integer;
  v_stock_id uuid;
  v_stock_qty integer;
  v_is_admin boolean;
  v_allowed_operator boolean;
  v_note text;
BEGIN
  SELECT *
  INTO v_task
  FROM public.production_order_tasks
  WHERE id = p_task_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tarea no encontrada';
  END IF;

  v_is_admin := public.is_admin();
  SELECT EXISTS (
    SELECT 1
    FROM public.production_operators
    WHERE id = v_task.operator_id
      AND user_id = auth.uid()
      AND active = true
  )
  INTO v_allowed_operator;

  IF NOT v_is_admin AND NOT v_allowed_operator THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  -- NULL means "do not touch this field". This prevents two live clients
  -- editing different counters from overwriting each other with stale values.
  v_next_produced := GREATEST(COALESCE(p_produced_qty, COALESCE(v_task.produced_qty, 0)), 0);
  v_next_waste := GREATEST(COALESCE(p_waste_qty, COALESCE(v_task.waste_qty, 0)), 0);
  v_next_printed := GREATEST(COALESCE(p_printed_qty, COALESCE(v_task.printed_qty, 0)), 0);
  v_note := COALESCE(p_note, COALESCE(v_task.note, ''));
  v_delta := v_next_produced - COALESCE(v_task.produced_qty, 0);

  UPDATE public.production_order_tasks
  SET produced_qty = v_next_produced,
      waste_qty = v_next_waste,
      printed_qty = v_next_printed,
      note = v_note,
      updated_at = now()
  WHERE id = p_task_id
  RETURNING * INTO v_task;

  IF v_delta <> 0 THEN
    SELECT id, qty_produced
    INTO v_stock_id, v_stock_qty
    FROM public.production_stock
    WHERE lower(trim(design_name)) = lower(trim(v_task.design_name))
    FOR UPDATE;

    IF v_stock_id IS NULL THEN
      INSERT INTO public.production_stock (design_name, qty_produced)
      VALUES (v_task.design_name, GREATEST(v_delta, 0));
    ELSE
      UPDATE public.production_stock
      SET qty_produced = GREATEST(0, COALESCE(v_stock_qty, 0) + v_delta)
      WHERE id = v_stock_id;
    END IF;

    INSERT INTO public.production_stock_log (design_name, qty, type, note)
    VALUES (
      v_task.design_name,
      abs(v_delta),
      CASE WHEN v_delta >= 0 THEN 'add' ELSE 'subtract' END,
      'Pedido ' || COALESCE(v_task.order_code, v_task.order_id::text)
    );
  END IF;

  RETURN v_task;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_production_task_progress(uuid, integer, integer, text, integer) TO authenticated;

DROP FUNCTION IF EXISTS public.get_operator_production_tasks();
CREATE OR REPLACE FUNCTION public.get_operator_production_tasks()
RETURNS TABLE (
  id uuid,
  order_id uuid,
  order_code text,
  order_created_at timestamptz,
  customer_name text,
  customer_email text,
  seller_id uuid,
  seller_name text,
  order_status text,
  order_notes text,
  design_key text,
  design_id text,
  design_name text,
  product_id text,
  product_name text,
  required_qty integer,
  printed_qty integer,
  produced_qty integer,
  waste_qty integer,
  note text,
  operator_id uuid,
  operator_name text,
  operator_email text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    t.id,
    t.order_id,
    t.order_code,
    t.order_created_at,
    t.customer_name,
    t.customer_email,
    t.seller_id,
    s.name AS seller_name,
    o.status AS order_status,
    o.notes AS order_notes,
    t.design_key,
    t.design_id,
    t.design_name,
    t.product_id,
    t.product_name,
    t.required_qty,
    t.printed_qty,
    t.produced_qty,
    t.waste_qty,
    t.note,
    t.operator_id,
    op.name AS operator_name,
    op.email AS operator_email,
    t.created_at,
    t.updated_at
  FROM public.production_order_tasks t
  LEFT JOIN public.orders o ON o.id = t.order_id
  LEFT JOIN public.sellers s ON s.id = t.seller_id
  LEFT JOIN public.production_operators op ON op.id = t.operator_id
  WHERE
    public.is_admin()
    OR t.operator_id IN (
      SELECT id
      FROM public.production_operators
      WHERE user_id = auth.uid()
        AND active = true
    )
  ORDER BY t.order_created_at DESC NULLS LAST, t.order_code, t.product_name, t.design_name;
$$;

GRANT EXECUTE ON FUNCTION public.get_operator_production_tasks() TO authenticated;

-- Migration: add printed_qty column
ALTER TABLE public.production_order_tasks
  ADD COLUMN IF NOT EXISTS printed_qty integer NOT NULL DEFAULT 0 CHECK (printed_qty >= 0);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'production_operators'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.production_operators;
  END IF;

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
