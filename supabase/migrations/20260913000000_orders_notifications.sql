ALTER TABLE public.orders
  ADD COLUMN items_updated_at TIMESTAMPTZ,
  ADD COLUMN kitchen_seen_at TIMESTAMPTZ;