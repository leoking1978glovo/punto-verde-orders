-- Migración: mesas del restaurante (grid de cocina + gestión en admin)
-- Aplica: Lovable Cloud la ejecuta automáticamente al detectar el archivo en supabase/migrations,
-- o ejecútalo manualmente en el SQL Editor de Supabase.

CREATE TABLE public.restaurant_tables (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  table_number INT NOT NULL UNIQUE,
  label TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.restaurant_tables TO anon, authenticated;
GRANT ALL ON public.restaurant_tables TO service_role;

ALTER TABLE public.restaurant_tables ENABLE ROW LEVEL SECURITY;
CREATE POLICY "restaurant_tables_public_read"
  ON public.restaurant_tables FOR SELECT TO anon, authenticated USING (true);

-- Tiempo real para que la cocina vea altas/bajas de mesas al instante
ALTER PUBLICATION supabase_realtime ADD TABLE public.restaurant_tables;

-- Tus 10 mesas actuales (ajusta etiquetas si quieres)
INSERT INTO public.restaurant_tables (table_number, label)
VALUES (1,'Mesa 1'),(2,'Mesa 2'),(3,'Mesa 3'),(4,'Mesa 4'),(5,'Mesa 5'),
       (6,'Mesa 6'),(7,'Mesa 7'),(8,'Mesa 8'),(9,'Mesa 9'),(10,'Mesa 10');