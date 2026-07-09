-- INKORA - Disenos extra agregados a un pedido ya existente (post-venta)
--
-- Permite que un admin (desde "Ver pedido") o un admin/operario (desde
-- Produccion) agregue un diseno adicional a un pedido que ya fue creado,
-- sin reenviar emails ni tocar el flujo normal de checkout. La cantidad
-- agregada queda registrada por separado (added_qty/added_via/added_by_*)
-- para poder mostrar el desglose "100 + 10" en el resumen de Produccion y
-- el tooltip de auditoria (quien y cuando), sin afectar la columna normal
-- "a producir" de cada fila.
--
-- Ejecutar en Supabase SQL Editor.
--
-- IMPORTANTE - bug preexistente encontrado y corregido de paso: la migracion
-- sql/production_order_tasks_position.sql (turno anterior, para el orden del
-- carrito) hizo CREATE OR REPLACE de admin_sync_order_production_tasks() y
-- get_operator_production_tasks() basandose en una copia vieja de esas
-- funciones (sql/production_orders_and_operators.sql), previa a
-- sql/fix_manual_link_persistence.sql. Eso piso sin querer la proteccion de
-- is_manual_link: quedo (a) sin la columna is_manual_link en el RETURNS
-- TABLE/SELECT de get_operator_production_tasks(), y (b) sin el "AND NOT
-- t.is_manual_link" en el DELETE de admin_sync_order_production_tasks(), es
-- decir, una tarea vinculada manualmente (linkManualItemToDesign, para items
-- sueltos de un pedido manual sin diseno de catalogo) podia borrarse sola en
-- el proximo resync. Verificado antes de tocar nada: 0 filas con
-- is_manual_link=true existen hoy en production_order_tasks, asi que no hubo
-- perdida de datos real conocida, pero se restaura la proteccion ahora que
-- se estan re-escribiendo estas mismas funciones para esta feature nueva.

ALTER TABLE public.production_order_tasks
  ADD COLUMN IF NOT EXISTS added_qty integer NOT NULL DEFAULT 0 CHECK (added_qty >= 0),
  ADD COLUMN IF NOT EXISTS added_via text CHECK (added_via IN ('pedido', 'produccion')),
  ADD COLUMN IF NOT EXISTS added_by_email text,
  ADD COLUMN IF NOT EXISTS added_by_name text,
  ADD COLUMN IF NOT EXISTS added_at timestamptz;

-- added_qty acumula SOLO lo agregado despues de la creacion del pedido; el
-- resync normal (mas abajo) no lo toca porque no lo menciona en su UPDATE
-- SET, asi que un resync posterior no lo resetea (los upsert de Postgres
-- conservan el valor existente de cualquier columna no listada en el SET
-- del ON CONFLICT).

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
      -- Si la tarea fue vinculada manualmente (linkManualItemToDesign), su
      -- design_id/name/product ya fue elegido a mano: no se pisa con lo que
      -- diga (o no diga) el item original.
      design_id = CASE WHEN production_order_tasks.is_manual_link THEN production_order_tasks.design_id ELSE EXCLUDED.design_id END,
      design_name = CASE WHEN production_order_tasks.is_manual_link THEN production_order_tasks.design_name ELSE EXCLUDED.design_name END,
      product_id = CASE WHEN production_order_tasks.is_manual_link THEN production_order_tasks.product_id ELSE EXCLUDED.product_id END,
      product_name = CASE WHEN production_order_tasks.is_manual_link THEN production_order_tasks.product_name ELSE EXCLUDED.product_name END,
      required_qty = EXCLUDED.required_qty,
      sort_order = EXCLUDED.sort_order,
      updated_at = now()
    RETURNING *
  )
  DELETE FROM public.production_order_tasks t
  WHERE t.order_id = p_order_id
    AND NOT t.is_manual_link
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

CREATE OR REPLACE FUNCTION public.add_order_extra_design(
  p_order_id uuid,
  p_design_id text,
  p_qty integer,
  p_added_via text
)
RETURNS public.production_order_tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_operator boolean;
  v_email text := lower(auth.jwt() ->> 'email');
  v_name text;
  v_order public.orders%ROWTYPE;
  v_design_name text;
  v_product_id text;
  v_product_name text;
  v_design_key text;
  v_new_item jsonb;
  v_task public.production_order_tasks%ROWTYPE;
BEGIN
  IF p_added_via NOT IN ('pedido', 'produccion') THEN
    RAISE EXCEPTION 'Origen invalido: %', p_added_via;
  END IF;

  IF COALESCE(p_qty, 0) <= 0 THEN
    RAISE EXCEPTION 'Cantidad invalida';
  END IF;

  IF NOT public.is_admin() THEN
    SELECT EXISTS (
      SELECT 1 FROM public.production_operators
      WHERE user_id = auth.uid() AND active = true
    ) INTO v_is_operator;

    IF NOT v_is_operator THEN
      RAISE EXCEPTION 'No autorizado';
    END IF;
  END IF;

  SELECT name INTO v_name FROM public.admins WHERE email = v_email;
  IF v_name IS NULL THEN
    SELECT name INTO v_name FROM public.production_operators WHERE lower(email) = v_email;
  END IF;

  SELECT *
  INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido no encontrado';
  END IF;

  SELECT d.name, d.product_id::text, p.name
  INTO v_design_name, v_product_id, v_product_name
  FROM public.designs d
  LEFT JOIN public.products p ON p.id = d.product_id
  WHERE d.id::text = p_design_id;

  IF v_design_name IS NULL THEN
    RAISE EXCEPTION 'Diseño no encontrado';
  END IF;

  v_design_key := p_design_id;

  v_new_item := jsonb_build_object(
    'design_id', p_design_id,
    'name', v_design_name,
    'product_id', v_product_id,
    'productName', COALESCE(v_product_name, 'Sin producto'),
    'qty', p_qty,
    'added_by', v_email,
    'added_by_name', v_name,
    'added_via', p_added_via,
    'added_at', now()
  );

  UPDATE public.orders
  SET items = COALESCE(items, '[]'::jsonb) || jsonb_build_array(v_new_item)
  WHERE id = p_order_id;

  INSERT INTO public.production_order_tasks (
    order_id, order_code, order_created_at, customer_name, customer_email, seller_id,
    design_key, design_id, design_name, product_id, product_name,
    required_qty, sort_order, added_qty, added_via, added_by_email, added_by_name, added_at
  )
  VALUES (
    v_order.id, v_order.order_code, v_order.created_at, v_order.customer_name, v_order.customer_email, v_order.seller_id,
    v_design_key, p_design_id, v_design_name, v_product_id, COALESCE(v_product_name, 'Sin producto'),
    p_qty,
    (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM public.production_order_tasks WHERE order_id = p_order_id),
    p_qty, p_added_via, v_email, v_name, now()
  )
  ON CONFLICT (order_id, design_key) DO UPDATE SET
    required_qty   = public.production_order_tasks.required_qty + EXCLUDED.required_qty,
    added_qty       = public.production_order_tasks.added_qty + EXCLUDED.added_qty,
    added_via       = EXCLUDED.added_via,
    added_by_email  = EXCLUDED.added_by_email,
    added_by_name   = EXCLUDED.added_by_name,
    added_at        = EXCLUDED.added_at,
    updated_at      = now()
  RETURNING * INTO v_task;

  RETURN v_task;
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_order_extra_design(uuid, text, integer, text) TO authenticated;

-- get_operator_production_tasks debe exponer is_manual_link (restaurado, ver
-- nota arriba) y las columnas added_* nuevas, para que tanto admin como
-- operario puedan ver el desglose y el tooltip de auditoria.
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
  is_manual_link boolean,
  added_qty integer,
  added_via text,
  added_by_email text,
  added_by_name text,
  added_at timestamptz,
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
    t.is_manual_link,
    t.added_qty,
    t.added_via,
    t.added_by_email,
    t.added_by_name,
    t.added_at,
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
