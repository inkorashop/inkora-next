-- INKORA — Admin order creation features
-- Run in Supabase SQL Editor

-- 1. Add delivery_date and source to orders
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivery_date date;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS source text DEFAULT 'web';

-- 2. Extend admins table with name and seller link
ALTER TABLE public.admins ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE public.admins ADD COLUMN IF NOT EXISTS seller_id uuid REFERENCES public.sellers(id) ON DELETE SET NULL;

-- 3. Index for fast admin-created order queries
CREATE INDEX IF NOT EXISTS orders_source_idx ON public.orders(source);
CREATE INDEX IF NOT EXISTS orders_delivery_date_idx ON public.orders(delivery_date);
