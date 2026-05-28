-- INKORA - Carritos activos en Admin
-- Ejecutar en Supabase SQL Editor.
-- Guarda y muestra carritos no confirmados de clientes logueados y visitantes.

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

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE public.carts
  ADD COLUMN IF NOT EXISTS session_id text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz DEFAULT now();

ALTER TABLE public.carts
  ALTER COLUMN id SET DEFAULT gen_random_uuid(),
  ALTER COLUMN user_id DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS carts_user_id_unique
  ON public.carts (user_id)
  WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS carts_anonymous_session_unique
  ON public.carts (session_id)
  WHERE user_id IS NULL AND session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS carts_updated_at_idx
  ON public.carts (updated_at DESC);

ALTER TABLE public.carts ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.carts TO anon, authenticated;

DROP POLICY IF EXISTS "admins_read_carts" ON public.carts;
DROP POLICY IF EXISTS "users_read_own_carts" ON public.carts;
DROP POLICY IF EXISTS "users_insert_own_carts" ON public.carts;
DROP POLICY IF EXISTS "users_update_own_carts" ON public.carts;
DROP POLICY IF EXISTS "users_delete_own_carts" ON public.carts;
DROP POLICY IF EXISTS "anonymous_manage_own_carts" ON public.carts;

CREATE OR REPLACE FUNCTION public.save_current_cart(p_session_id text, p_items jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_session_id text := NULLIF(trim(COALESCE(p_session_id, '')), '');
  v_has_items boolean := p_items IS NOT NULL
    AND jsonb_typeof(p_items) = 'array'
    AND jsonb_array_length(p_items) > 0;
BEGIN
  IF v_user_id IS NULL AND v_session_id IS NULL THEN
    RETURN;
  END IF;

  IF NOT v_has_items THEN
    IF v_user_id IS NOT NULL THEN
      DELETE FROM public.carts
      WHERE user_id = v_user_id;
    ELSIF v_session_id IS NOT NULL THEN
      DELETE FROM public.carts
      WHERE user_id IS NULL
        AND session_id = v_session_id;
    END IF;
    RETURN;
  END IF;

  IF v_user_id IS NOT NULL THEN
    INSERT INTO public.carts (id, user_id, session_id, items, updated_at, last_seen_at)
    VALUES (v_user_id, v_user_id, v_session_id, p_items, now(), now())
    ON CONFLICT (id) DO UPDATE
      SET user_id = EXCLUDED.user_id,
          session_id = EXCLUDED.session_id,
          items = EXCLUDED.items,
          updated_at = EXCLUDED.updated_at,
          last_seen_at = EXCLUDED.last_seen_at;

    IF v_session_id IS NOT NULL THEN
      DELETE FROM public.carts
      WHERE user_id IS NULL
        AND session_id = v_session_id;
    END IF;
  ELSE
    INSERT INTO public.carts (session_id, items, updated_at, last_seen_at)
    VALUES (v_session_id, p_items, now(), now())
    ON CONFLICT (session_id) WHERE user_id IS NULL DO UPDATE
      SET items = EXCLUDED.items,
          updated_at = EXCLUDED.updated_at,
          last_seen_at = EXCLUDED.last_seen_at;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_current_cart(text, jsonb) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.save_current_cart(p_items jsonb)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.save_current_cart(NULL::text, p_items);
$$;

GRANT EXECUTE ON FUNCTION public.save_current_cart(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_current_cart(p_session_id text)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  session_id text,
  items jsonb,
  updated_at timestamptz,
  last_seen_at timestamptz,
  is_anonymous boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.id,
    c.user_id,
    c.session_id,
    c.items::jsonb,
    c.updated_at,
    c.last_seen_at,
    c.user_id IS NULL AS is_anonymous
  FROM public.carts c
  WHERE (
      auth.uid() IS NOT NULL
      AND c.user_id = auth.uid()
    )
    OR (
      NULLIF(trim(COALESCE(p_session_id, '')), '') IS NOT NULL
      AND c.user_id IS NULL
      AND c.session_id = NULLIF(trim(COALESCE(p_session_id, '')), '')
    )
  ORDER BY
    CASE WHEN auth.uid() IS NOT NULL AND c.user_id = auth.uid() THEN 0 ELSE 1 END,
    c.updated_at DESC
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_current_cart(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_get_active_carts()
RETURNS SETOF public.carts
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.*
  FROM public.carts c
  WHERE public.is_admin()
    AND jsonb_typeof(c.items::jsonb) = 'array'
    AND EXISTS (
      SELECT 1
      FROM jsonb_array_elements(c.items::jsonb) AS item
      WHERE COALESCE(NULLIF(item ->> 'qty', '')::numeric, 0) > 0
    )
  ORDER BY c.updated_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_active_carts() TO authenticated;

CREATE POLICY "admins_read_carts"
  ON public.carts FOR SELECT
  USING (public.is_admin());

CREATE POLICY "users_read_own_carts"
  ON public.carts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "users_insert_own_carts"
  ON public.carts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users_update_own_carts"
  ON public.carts FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users_delete_own_carts"
  ON public.carts FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "anonymous_manage_own_carts"
  ON public.carts FOR ALL
  USING (false)
  WITH CHECK (false);

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
    ALTER PUBLICATION supabase_realtime ADD TABLE public.carts;
  EXCEPTION
    WHEN duplicate_object THEN
      RAISE NOTICE 'Tabla public.carts ya estaba en supabase_realtime.';
  END;
END $$;
