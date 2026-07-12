-- INKORA - Quitar un diseno agregado a un pedido ya existente
--
-- Complementa a add_order_extra_design / edit_order_extra_design
-- (sql/order_extra_designs.sql, sql/edit_order_extra_design.sql): permite
-- deshacer una adicion por completo (borra la fila de
-- production_order_tasks y el item correspondiente en orders.items), en vez
-- de solo poder corregir diseno/cantidad.
--
-- Identifica la fila por (order_id, design_key) igual que
-- edit_order_extra_design, por el mismo motivo (el modal "Ver pedido" no
-- conoce el id de la tarea).
--
-- Solo aplica a filas "puramente agregadas" (added_via IS NOT NULL y
-- added_qty = required_qty) — borrar una fila mezclada borraria tambien
-- cantidad original del pedido, asi que se rechaza con un mensaje explicito
-- en vez de hacer algo destructivo y ambiguo. La UI ademas solo ofrece el
-- boton de borrado para filas agregadas desde Produccion (decision de
-- producto, no una restriccion de esta funcion — la funcion en si es
-- generica para los dos origenes, igual que edit_order_extra_design).
--
-- Ejecutar en Supabase SQL Editor.

CREATE OR REPLACE FUNCTION public.remove_order_extra_design(
  p_order_id uuid,
  p_design_id text
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
  v_items jsonb;
  v_item jsonb;
  v_new_items jsonb := '[]'::jsonb;
  v_item_key text;
BEGIN
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
    AND design_key = p_design_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tarea no encontrada';
  END IF;

  IF v_task.added_via IS NULL THEN
    RAISE EXCEPTION 'Esta fila no fue agregada manualmente, no se puede quitar asi';
  END IF;

  IF v_task.added_qty IS DISTINCT FROM v_task.required_qty THEN
    RAISE EXCEPTION 'Esta fila mezcla cantidad original y agregada; no se puede quitar una fila mixta';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = v_task.order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido no encontrado';
  END IF;

  v_items := COALESCE(v_order.items, '[]'::jsonb);

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_items)
  LOOP
    v_item_key := COALESCE(NULLIF(v_item->>'design_id', ''), NULLIF(v_item->>'designId', ''), NULLIF(v_item->>'id', ''));
    IF v_item_key = v_task.design_key THEN
      CONTINUE; -- se descarta: es el item que se esta quitando
    END IF;
    v_new_items := v_new_items || jsonb_build_array(v_item);
  END LOOP;

  UPDATE public.orders SET items = v_new_items WHERE id = v_order.id;

  DELETE FROM public.production_order_tasks WHERE id = v_task.id;

  RETURN v_task;
END;
$$;

GRANT EXECUTE ON FUNCTION public.remove_order_extra_design(uuid, text) TO authenticated;
