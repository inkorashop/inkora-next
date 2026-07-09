-- INKORA - Auditoria de movimientos de stock: de que pedido es y quien lo hizo
--
-- production_stock_log solo guardaba un "note" de texto libre (ej. "Pedido
-- ABC123" o "Edicion inline"), sin ninguna columna real para filtrar/mostrar
-- de forma prolija. Se agregan order_id/order_code (denormalizado, igual que
-- ya hace production_order_tasks con order_code/customer_name, para no
-- depender de que el pedido siga cargado en memoria o no este archivado) y
-- actor_email/actor_name (quien hizo el movimiento).
--
-- Nota: se encontraron DOS versiones superpuestas (overload) de
-- update_production_task_progress ya viviendo en la base (una vieja de 4
-- parametros sin p_printed_qty, y la actual de 5 parametros). El cliente
-- siempre manda p_printed_qty con nombre, asi que Postgres resuelve siempre
-- a la de 5 parametros — la de 4 esta inalcanzable desde el codigo actual.
-- No se toca/borra esa version vieja en esta migracion (fuera de alcance de
-- este cambio), solo se actualiza la de 5 parametros que es la que se usa.
--
-- Ejecutar en Supabase SQL Editor.

ALTER TABLE public.production_stock_log
  ADD COLUMN IF NOT EXISTS order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS order_code text,
  ADD COLUMN IF NOT EXISTS actor_email text,
  ADD COLUMN IF NOT EXISTS actor_name text;

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
  v_actor_email text := lower(auth.jwt() ->> 'email');
  v_actor_name text;
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

  SELECT name INTO v_actor_name FROM public.admins WHERE email = v_actor_email;
  IF v_actor_name IS NULL THEN
    SELECT name INTO v_actor_name FROM public.production_operators WHERE lower(email) = v_actor_email;
  END IF;

  -- NULL significa "no tocar este campo". Asi dos PCs pueden editar
  -- impreso/troquelado/desperdicio/nota sin pisarse con valores viejos.
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

    INSERT INTO public.production_stock_log (design_name, qty, type, note, order_id, order_code, actor_email, actor_name)
    VALUES (
      v_task.design_name,
      abs(v_delta),
      CASE WHEN v_delta >= 0 THEN 'add' ELSE 'subtract' END,
      'Pedido ' || COALESCE(v_task.order_code, v_task.order_id::text),
      v_task.order_id,
      v_task.order_code,
      v_actor_email,
      v_actor_name
    );
  END IF;

  RETURN v_task;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_production_task_progress(uuid, integer, integer, text, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.increment_production_task_counter(
  p_task_id uuid,
  p_field text,
  p_delta integer
)
RETURNS public.production_order_tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task public.production_order_tasks%ROWTYPE;
  v_next integer;
  v_stock_delta integer := 0;
  v_stock_id uuid;
  v_stock_qty integer;
  v_is_admin boolean;
  v_allowed_operator boolean;
  v_actor_email text := lower(auth.jwt() ->> 'email');
  v_actor_name text;
BEGIN
  IF p_field NOT IN ('produced_qty', 'waste_qty', 'printed_qty') THEN
    RAISE EXCEPTION 'Campo de contador invalido: %', p_field;
  END IF;

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

  SELECT name INTO v_actor_name FROM public.admins WHERE email = v_actor_email;
  IF v_actor_name IS NULL THEN
    SELECT name INTO v_actor_name FROM public.production_operators WHERE lower(email) = v_actor_email;
  END IF;

  IF p_field = 'produced_qty' THEN
    v_next := GREATEST(COALESCE(v_task.produced_qty, 0) + COALESCE(p_delta, 0), 0);
    v_stock_delta := v_next - COALESCE(v_task.produced_qty, 0);
    UPDATE public.production_order_tasks
    SET produced_qty = v_next,
        updated_at = now()
    WHERE id = p_task_id
    RETURNING * INTO v_task;
  ELSIF p_field = 'waste_qty' THEN
    v_next := GREATEST(COALESCE(v_task.waste_qty, 0) + COALESCE(p_delta, 0), 0);
    UPDATE public.production_order_tasks
    SET waste_qty = v_next,
        updated_at = now()
    WHERE id = p_task_id
    RETURNING * INTO v_task;
  ELSE
    v_next := GREATEST(COALESCE(v_task.printed_qty, 0) + COALESCE(p_delta, 0), 0);
    UPDATE public.production_order_tasks
    SET printed_qty = v_next,
        updated_at = now()
    WHERE id = p_task_id
    RETURNING * INTO v_task;
  END IF;

  IF v_stock_delta <> 0 THEN
    SELECT id, qty_produced
    INTO v_stock_id, v_stock_qty
    FROM public.production_stock
    WHERE lower(trim(design_name)) = lower(trim(v_task.design_name))
    FOR UPDATE;

    IF v_stock_id IS NULL THEN
      INSERT INTO public.production_stock (design_name, qty_produced)
      VALUES (v_task.design_name, GREATEST(v_stock_delta, 0));
    ELSE
      UPDATE public.production_stock
      SET qty_produced = GREATEST(0, COALESCE(v_stock_qty, 0) + v_stock_delta)
      WHERE id = v_stock_id;
    END IF;

    INSERT INTO public.production_stock_log (design_name, qty, type, note, order_id, order_code, actor_email, actor_name)
    VALUES (
      v_task.design_name,
      abs(v_stock_delta),
      CASE WHEN v_stock_delta >= 0 THEN 'add' ELSE 'subtract' END,
      'Pedido ' || COALESCE(v_task.order_code, v_task.order_id::text),
      v_task.order_id,
      v_task.order_code,
      v_actor_email,
      v_actor_name
    );
  END IF;

  RETURN v_task;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_production_task_counter(uuid, text, integer) TO authenticated;
