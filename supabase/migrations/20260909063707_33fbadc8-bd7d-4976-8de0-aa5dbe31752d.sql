ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS image_url text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';

UPDATE public.menu_items SET image_url = '/menu/ceviche-verde.jpg', tags = ARRAY['Sin gluten','Picante'] WHERE name = 'Ceviche verde';
UPDATE public.menu_items SET image_url = '/menu/bruschetta-huerta.jpg', tags = ARRAY['Vegano'] WHERE name = 'Bruschetta de huerta';
UPDATE public.menu_items SET image_url = '/menu/crema-auyama.jpg', tags = ARRAY['Vegano','Sin gluten'] WHERE name = 'Crema de auyama';
UPDATE public.menu_items SET image_url = '/menu/trucha-limon.jpg', tags = ARRAY['Sin gluten'] WHERE name = 'Trucha al limón';
UPDATE public.menu_items SET image_url = '/menu/bowl-punto-verde.jpg', tags = ARRAY['Vegano','Sin gluten'] WHERE name = 'Bowl Punto Verde';
UPDATE public.menu_items SET image_url = '/menu/lomo-brasa.jpg', tags = ARRAY['Sin gluten'] WHERE name = 'Lomo de res a la brasa';
UPDATE public.menu_items SET image_url = '/menu/risotto-champinones.jpg', tags = ARRAY['Sin gluten'] WHERE name = 'Risotto de champiñones';
UPDATE public.menu_items SET image_url = '/menu/limonada-hierbabuena.jpg', tags = ARRAY['Vegano','Sin gluten'] WHERE name = 'Limonada de hierbabuena';
UPDATE public.menu_items SET image_url = '/menu/jugo-maracuya.jpg', tags = ARRAY['Vegano','Sin gluten'] WHERE name = 'Jugo de maracuyá';
UPDATE public.menu_items SET image_url = '/menu/cafe-origen.jpg', tags = ARRAY['Vegano','Sin gluten'] WHERE name = 'Café de origen';
UPDATE public.menu_items SET image_url = '/menu/tarta-limon.jpg', tags = ARRAY[]::text[] WHERE name = 'Tarta de limón';
UPDATE public.menu_items SET image_url = '/menu/brownie-cacao.jpg', tags = ARRAY['Sin gluten'] WHERE name = 'Brownie de cacao';