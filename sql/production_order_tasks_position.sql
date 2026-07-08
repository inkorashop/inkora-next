-- INKORA - Preservar el orden de seleccion del carrito en produccion
-- Ejecutar en Supabase SQL Editor.
--
-- Hasta ahora production_order_tasks no guardaba la posicion original de
-- cada diseno dentro del pedido, asi que get_operator_production_tasks()
-- terminaba ordenando alfabeticamente (product_name, design_name) como
-- criterio estable. Esto agrega una columna sort_order (indice del item
-- dentro del array items del pedido, tal como se selecciono en el carrito;
-- se llama sort_order y no "position" porque POSITION es palabra reservada
-- de SQL), la completa para pedidos ya existentes, y actualiza las
-- funciones que crean/devuelven tareas para que ordenen por esa columna.

ALTER TABLE public.production_order_tasks ADD COLUMN IF NOT EXISTS sort_order integer;

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
      GREATEST(COALESCE(NULLIF(item->>'qty', '')::integer, 0), 0) AS qty,
      ordinality AS item_sort_order
    FROM jsonb_array_elements(COALESCE(v_order.items::jsonb, '[]'::jsonb)) WITH ORDINALITY AS t(item, ordinality)
  ),
  grouped AS (
    SELECT
      design_key,
      MAX(design_id) AS design_id,
      MAX(design_name) AS design_name,
      MAX(product_id) AS product_id,
      MAX(product_name) AS product_name,
      SUM(qty)::integer AS required_qty,
      MIN(item_sort_order)::integer AS sort_order
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
      required_qty,
      sort_order
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
      grouped.required_qty,
      grouped.sort_order
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
      sort_order = EXCLUDED.sort_order,
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
  ORDER BY sort_order NULLS LAST, product_name, design_name;
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
  ORDER BY sort_order NULLS LAST, product_name, design_name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_assign_order_operator(uuid, uuid) TO authenticated;

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
  sort_order integer,
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
    t.sort_order,
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
  ORDER BY t.order_created_at DESC NULLS LAST, t.order_code, t.sort_order NULLS LAST, t.product_name, t.design_name;
$$;

GRANT EXECUTE ON FUNCTION public.get_operator_production_tasks() TO authenticated;

-- Backfill: recupera la posicion original para tareas ya existentes,
-- re-derivandola del array items del pedido (mismo criterio que arriba).
WITH item_positions AS (
  SELECT
    o.id AS order_id,
    COALESCE(
      NULLIF(item->>'design_id', ''),
      NULLIF(item->>'designId', ''),
      NULLIF(item->>'id', ''),
      NULLIF(item->>'name', '')
    ) AS design_key,
    MIN(ordinality)::integer AS sort_order
  FROM public.orders o
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(o.items::jsonb, '[]'::jsonb)) WITH ORDINALITY AS t(item, ordinality)
  GROUP BY o.id, design_key
)
UPDATE public.production_order_tasks t
SET sort_order = ip.sort_order
FROM item_positions ip
WHERE t.order_id = ip.order_id
  AND t.design_key = ip.design_key
  AND t.sort_order IS NULL;
