-- INKORA - Auditoria de quien cargo un pedido a mano desde el admin
--
-- Los pedidos de clientes (checkout normal) ya muestran fecha y cliente, asi
-- que no hace falta nada nuevo ahi. Lo que faltaba era saber, para un pedido
-- cargado a mano por un admin desde "Nuevo pedido", quien lo cargo y cuando
-- (mas alla del created_at que ya existia). Queda NULL para pedidos viejos y
-- para pedidos de clientes (no se completa en ese flujo).
--
-- Ejecutar en Supabase SQL Editor.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS created_by_email text,
  ADD COLUMN IF NOT EXISTS created_by_name text;
