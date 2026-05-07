-- Agrega seller_id y send_confirmation_email a profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS seller_id uuid REFERENCES public.sellers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS send_confirmation_email boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS phone text;

-- Actualiza admin_get_profiles para devolver los nuevos campos
DROP FUNCTION IF EXISTS admin_get_profiles();
CREATE OR REPLACE FUNCTION admin_get_profiles()
RETURNS TABLE (
  id                      uuid,
  email                   text,
  name                    text,
  locality_id             uuid,
  locality_name           text,
  seller_id               uuid,
  send_confirmation_email boolean,
  phone                   text,
  created_at              timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id,
    p.email,
    p.name,
    p.locality_id,
    l.name AS locality_name,
    p.seller_id,
    COALESCE(p.send_confirmation_email, true) AS send_confirmation_email,
    p.phone,
    p.created_at
  FROM profiles p
  LEFT JOIN localities l ON p.locality_id = l.id
  ORDER BY p.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_profiles() TO anon, authenticated;

-- RPC: asignar vendedor a usuario
CREATE OR REPLACE FUNCTION admin_update_user_seller(
  p_user_id   uuid,
  p_seller_id uuid
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE profiles
  SET seller_id = p_seller_id
  WHERE id = p_user_id;
$$;

GRANT EXECUTE ON FUNCTION public.admin_update_user_seller(uuid, uuid) TO anon, authenticated;

-- RPC: activar/desactivar email de confirmación de pedido
CREATE OR REPLACE FUNCTION admin_update_user_confirmation(
  p_user_id           uuid,
  p_send_confirmation boolean
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE profiles
  SET send_confirmation_email = p_send_confirmation
  WHERE id = p_user_id;
$$;

GRANT EXECUTE ON FUNCTION public.admin_update_user_confirmation(uuid, boolean) TO anon, authenticated;
