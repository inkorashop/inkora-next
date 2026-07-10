-- INKORA - Editar inline un diseno agregado a un pedido (diseno + cantidad)
--
-- Complementa a add_order_extra_design (sql/order_extra_designs.sql): permite
-- corregir, sin borrar y volver a cargar, una fila que se agrego a mano
-- (added_via IS NOT NULL) — tanto que diseno es, como su cantidad. Editable
-- desde Produccion o desde Pedido; en ambos casos la edicion actualiza
-- production_order_tasks + orders.items (fuente que usa "Ver pedido").
--
-- Identifica la fila por (order_id, design_key ORIGINAL) en vez de por el id
-- de la tarea (production_order_tasks.id), porque el modal "Ver pedido" solo
-- conoce orders.items (que no tiene el id de la tarea) — asi ambos llamadores
-- (Produccion, que si tiene el id de tarea, y Pedido, que no) pueden usar la
-- misma funcion con los datos que cada uno ya tiene a mano.
--
-- Solo aplica a filas "puramente agregadas" (added_qty = required_qty, es
-- decir, TODA la cantidad de esa fila vino de la adicion, no una mezcla con
-- cantidad original del pedido) — reasignar el diseno de una fila mezclada
-- no tiene un significado claro (¿que parte se reasigna?), asi que se
-- rechaza esa edicion con un mensaje explicito en vez de hacer algo ambiguo.
--
-- Si el diseno nuevo elegido YA tiene su propia fila en el pedido, se
-- fusiona ahi (se suma la cantidad) y se borra la fila vieja, en vez de
-- violar el UNIQUE(order_id, design_key).
--
-- Ejecutar en Supabase SQL Editor.

DROP FUNCTION IF EXISTS public.edit_order_extra_design(uuid, text, integer);

CREATE OR REPLACE FUNCTION public.edit_order_extra_design(
  p_order_id uuid,
  p_old_design_id text,
  p_new_design_id text,
  p_new_qty integer
)
RETURNS public.production_order_tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_operator boolean;
  v_task public.production_order_tasks%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_design_name text;
  v_product_id text;
  v_product_name text;
  v_new_design_key text;
  v_target public.production_order_tasks%ROWTYPE;
  v_items jsonb;
  v_item jsonb;
  v_new_items jsonb := '[]'::jsonb;
  v_matched boolean := false;
  v_item_key text;
BEGIN
  IF COALESCE(p_new_qty, 0) <= 0 THEN
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

  SELECT *
  INTO v_task
  FROM public.production_order_tasks
  WHERE order_id = p_order_id
    AND design_key = p_old_design_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tarea no encontrada';
  END IF;

  IF v_task.added_via IS NULL THEN
    RAISE EXCEPTION 'Esta fila no fue agregada manualmente, no se puede editar asi';
  END IF;

  IF v_task.added_qty IS DISTINCT FROM v_task.required_qty THEN
    RAISE EXCEPTION 'Esta fila mezcla cantidad original y agregada; no se puede reasignar el diseno de una fila mixta';
  END IF;

  SELECT d.name, d.product_id::text, p.name
  INTO v_design_name, v_product_id, v_product_name
  FROM public.designs d
  LEFT JOIN public.products p ON p.id = d.product_id
  WHERE d.id::text = p_new_design_id;

  IF v_design_name IS NULL THEN
    RAISE EXCEPTION 'Diseño no encontrado';
  END IF;

  v_new_design_key := p_new_design_id;

  SELECT * INTO v_order FROM public.orders WHERE id = v_task.order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido no encontrado';
  END IF;

  v_items := COALESCE(v_order.items, '[]'::jsonb);

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_items)
  LOOP
    v_item_key := COALESCE(NULLIF(v_item->>'design_id', ''), NULLIF(v_item->>'designId', ''), NULLIF(v_item->>'id', ''));

    IF v_item_key = v_task.design_key AND NOT v_matched THEN
      v_new_items := v_new_items || jsonb_build_array(jsonb_build_object(
        'design_id', p_new_design_id,
        'name', v_design_name,
        'product_id', v_product_id,
        'productName', COALESCE(v_product_name, 'Sin producto'),
        'qty', p_new_qty,
        'added_by', v_task.added_by_email,
        'added_by_name', v_task.added_by_name,
        'added_via', v_task.added_via,
        'added_at', v_task.added_at
      ));
      v_matched := true;
    ELSIF v_item_key = v_task.design_key THEN
      -- Item extra repetido con el mismo design_key viejo (adiciones
      -- acumuladas sobre la misma fila): se descarta, ya quedo representado
      -- en el item de reemplazo de arriba.
      CONTINUE;
    ELSE
      v_new_items := v_new_items || jsonb_build_array(v_item);
    END IF;
  END LOOP;

  UPDATE public.orders SET items = v_new_items WHERE id = v_order.id;

  SELECT *
  INTO v_target
  FROM public.production_order_tasks
  WHERE order_id = v_task.order_id
    AND design_key = v_new_design_key
    AND id <> v_task.id
  FOR UPDATE;

  IF FOUND THEN
    UPDATE public.production_order_tasks
    SET required_qty = v_target.required_qty + p_new_qty,
        added_qty = v_target.added_qty + p_new_qty,
        added_via = v_task.added_via,
        added_by_email = v_task.added_by_email,
        added_by_name = v_task.added_by_name,
        added_at = v_task.added_at,
        updated_at = now()
    WHERE id = v_target.id
    RETURNING * INTO v_target;

    DELETE FROM public.production_order_tasks WHERE id = v_task.id;
    RETURN v_target;
  END IF;

  UPDATE public.production_order_tasks
  SET design_key = v_new_design_key,
      design_id = p_new_design_id,
      design_name = v_design_name,
      product_id = v_product_id,
      product_name = COALESCE(v_product_name, 'Sin producto'),
      required_qty = p_new_qty,
      added_qty = p_new_qty,
      updated_at = now()
  WHERE id = v_task.id
  RETURNING * INTO v_task;

  RETURN v_task;
END;
$$;

GRANT EXECUTE ON FUNCTION public.edit_order_extra_design(uuid, text, text, integer) TO authenticated;
