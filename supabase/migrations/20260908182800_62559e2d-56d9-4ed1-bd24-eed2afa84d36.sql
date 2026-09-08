
CREATE TABLE public.menu_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price NUMERIC(10,2) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  available BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.menu_items TO anon, authenticated;
GRANT ALL ON public.menu_items TO service_role;
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "menu_items_public_read" ON public.menu_items FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE public.orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  table_number INT NOT NULL,
  status TEXT NOT NULL DEFAULT 'activo',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX orders_one_active_per_table ON public.orders (table_number) WHERE status = 'activo';
GRANT SELECT, INSERT, UPDATE ON public.orders TO anon, authenticated;
GRANT ALL ON public.orders TO service_role;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "orders_public_read" ON public.orders FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "orders_public_insert" ON public.orders FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "orders_public_update" ON public.orders FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.order_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  menu_item_id UUID REFERENCES public.menu_items(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  unit_price NUMERIC(10,2) NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.order_items TO anon, authenticated;
GRANT ALL ON public.order_items TO service_role;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "order_items_public_read" ON public.order_items FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "order_items_public_insert" ON public.order_items FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "order_items_public_update" ON public.order_items FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql SET search_path = public;
CREATE TRIGGER orders_touch_updated_at BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.order_items;

INSERT INTO public.menu_items (category, name, description, price, sort_order) VALUES
('Entradas','Ceviche verde','Pescado fresco, leche de tigre de cilantro y aguacate.', 24000, 1),
('Entradas','Bruschetta de huerta','Pan de masa madre, tomate confitado y albahaca.', 16000, 2),
('Entradas','Crema de auyama','Auyama asada, coco y semillas tostadas.', 15000, 3),
('Platos fuertes','Trucha al limón','Trucha de río, mantequilla de hierbas y papa criolla.', 42000, 1),
('Platos fuertes','Bowl Punto Verde','Quinua, vegetales asados, garbanzo crocante y tahini.', 34000, 2),
('Platos fuertes','Lomo de res a la brasa','Lomo madurado, chimichurri y yuca rústica.', 52000, 3),
('Platos fuertes','Risotto de champiñones','Arroz cremoso, portobello y parmesano.', 38000, 4),
('Bebidas','Limonada de hierbabuena','Limón fresco, hierbabuena y un toque de miel.', 10000, 1),
('Bebidas','Jugo de maracuyá','Maracuyá natural en agua o leche.', 9000, 2),
('Bebidas','Café de origen','Filtrado del día, tostión media.', 8000, 3),
('Postres','Tarta de limón','Base de almendra y merengue tostado.', 14000, 1),
('Postres','Brownie de cacao','Cacao 70%, helado de vainilla.', 15000, 2);
