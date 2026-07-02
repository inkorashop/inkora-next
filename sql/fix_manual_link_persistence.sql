-- Fix: manual design links in production tasks reset on page refresh.
--
-- Root cause: admin_sync_order_production_tasks() is called every time an order
-- is selected. It deletes any production_order_tasks rows whose design_key is not
-- in the current order items. Manual links were inserted with design_key = design.name,
-- which doesn't match the order item's design_key (= item.id), so they get deleted.
--
-- Fix: add is_manual_link column. The sync function now:
--   - Preserves design_id/design_name/product info when is_manual_link = true (DO UPDATE)
--   - Never deletes rows with is_manual_link = true (DELETE)
--
-- The JS linkManualItemToDesign is also updated to UPSERT using design_key = item.id
-- (matching what the auto-sync creates), so there is only ONE task per manual item.
--
-- Run in Supabase SQL Editor.

-- 1. Add column
ALTER TABLE public.production_order_tasks
  ADD COLUMN IF NOT EXISTS is_manual_link boolean NOT NULL DEFAULT false;

-- 2. Update sync function
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

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido no encontrado'; END IF;

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
      MAX(design_id)   AS design_id,
      MAX(design_name) AS design_name,
      MAX(product_id)  AS product_id,
      MAX(product_name) AS product_name,
      SUM(qty)::integer AS required_qty
    FROM item_rows
    WHERE design_key IS NOT NULL AND qty > 0
    GROUP BY design_key
  ),
  upserted AS (
    INSERT INTO public.production_order_tasks (
      order_id, order_code, order_created_at, customer_name, customer_email,
      seller_id, design_key, design_id, design_name, product_id, product_name, required_qty
    )
    SELECT
      v_order.id, v_order.order_code, v_order.created_at,
      v_order.customer_name, v_order.customer_email, v_order.seller_id,
      g.design_key, g.design_id, g.design_name,
      g.product_id, g.product_name, g.required_qty
    FROM grouped g
    ON CONFLICT (order_id, design_key) DO UPDATE SET
      order_code       = EXCLUDED.order_code,
      order_created_at = EXCLUDED.order_created_at,
      customer_name    = EXCLUDED.customer_name,
      customer_email   = EXCLUDED.customer_email,
      seller_id        = EXCLUDED.seller_id,
      -- When is_manual_link = true, preserve the manually-set design info.
      design_id    = CASE WHEN production_order_tasks.is_manual_link THEN production_order_tasks.design_id    ELSE EXCLUDED.design_id    END,
      design_name  = CASE WHEN production_order_tasks.is_manual_link THEN production_order_tasks.design_name  ELSE EXCLUDED.design_name  END,
      product_id   = CASE WHEN production_order_tasks.is_manual_link THEN production_order_tasks.product_id   ELSE EXCLUDED.product_id   END,
      product_name = CASE WHEN production_order_tasks.is_manual_link THEN production_order_tasks.product_name ELSE EXCLUDED.product_name END,
      required_qty = EXCLUDED.required_qty,
      updated_at   = now()
    RETURNING *
  )
  DELETE FROM public.production_order_tasks t
  WHERE t.order_id = p_order_id
    AND NOT t.is_manual_link   -- never delete manually-linked tasks
    AND NOT EXISTS (SELECT 1 FROM grouped g WHERE g.design_key = t.design_key);

  RETURN QUERY
  SELECT * FROM public.production_order_tasks
  WHERE order_id = p_order_id
  ORDER BY product_name, design_name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_sync_order_production_tasks(uuid) TO authenticated;

-- 3. Add is_manual_link to get_operator_production_tasks RPC
DROP FUNCTION IF EXISTS public.get_operator_production_tasks();
CREATE OR REPLACE FUNCTION public.get_operator_production_tasks()
RETURNS TABLE (
  id               uuid,
  order_id         uuid,
  order_code       text,
  order_created_at timestamptz,
  customer_name    text,
  customer_email   text,
  seller_id        uuid,
  seller_name      text,
  order_status     text,
  order_notes      text,
  design_key       text,
  design_id        text,
  design_name      text,
  product_id       text,
  product_name     text,
  required_qty     integer,
  printed_qty      integer,
  produced_qty     integer,
  waste_qty        integer,
  note             text,
  operator_id      uuid,
  operator_name    text,
  operator_email   text,
  is_manual_link   boolean,
  created_at       timestamptz,
  updated_at       timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    t.id, t.order_id, t.order_code, t.order_created_at,
    t.customer_name, t.customer_email, t.seller_id,
    s.name       AS seller_name,
    o.status     AS order_status,
    o.notes      AS order_notes,
    t.design_key, t.design_id, t.design_name, t.product_id, t.product_name,
    t.required_qty, t.printed_qty, t.produced_qty, t.waste_qty, t.note,
    t.operator_id,
    op.name      AS operator_name,
    op.email     AS operator_email,
    t.is_manual_link,
    t.created_at, t.updated_at
  FROM public.production_order_tasks t
  LEFT JOIN public.orders o  ON o.id  = t.order_id
  LEFT JOIN public.sellers s ON s.id  = t.seller_id
  LEFT JOIN public.production_operators op ON op.id = t.operator_id
  WHERE
    public.is_admin()
    OR t.operator_id IN (
      SELECT id FROM public.production_operators
      WHERE user_id = auth.uid() AND active = true
    )
  ORDER BY t.order_created_at DESC NULLS LAST, t.order_code, t.product_name, t.design_name;
$$;

GRANT EXECUTE ON FUNCTION public.get_operator_production_tasks() TO authenticated;
