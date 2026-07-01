-- INKORA — Admin order creation features
-- Run in Supabase SQL Editor

-- 1. Add columns to orders
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivery_date date;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS source text DEFAULT 'web';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS created_by text; -- admin email who created it

-- 2. Extend admins table with name and seller link
ALTER TABLE public.admins ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE public.admins ADD COLUMN IF NOT EXISTS seller_id uuid REFERENCES public.sellers(id) ON DELETE SET NULL;

-- 3. Indexes
CREATE INDEX IF NOT EXISTS orders_source_idx ON public.orders(source);
CREATE INDEX IF NOT EXISTS orders_delivery_date_idx ON public.orders(delivery_date);
CREATE INDEX IF NOT EXISTS orders_created_by_idx ON public.orders(created_by);
