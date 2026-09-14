import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Moon, Sun } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTheme } from "@/lib/theme";
import { RESTAURANT } from "@/lib/restaurant";
import { RestaurantFooter } from "@/components/RestaurantFooter";

type CategoryLite = {
  name: string;
  sort_order: number;
};

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>): { mesa?: string } =>
    search["mesa"] != null ? { mesa: String(search["mesa"]) } : {},

  head: () => ({
    meta: [
      { title: "Menú | Restaurante Punto Verde" },
      {
        name: "description",
        content:
          "Escanea el QR de tu mesa y pide desde el celular en Restaurante Punto Verde: cocina fresca, natural y de temporada.",
      },
      { property: "og:title", content: "Menú | Restaurante Punto Verde" },
      {
        property: "og:description",
        content: "Pide desde tu mesa con el menú digital de Restaurante Punto Verde.",
      },
    ],
  }),
  component: HomePage,
  errorComponent: ({ error }) => (
    <div role="alert" className="p-8 text-center text-sm text-muted-foreground">
      No pudimos cargar el menú: {error.message}
    </div>
  ),
});

function HomePage() {
  const { mesa } = Route.useSearch();
  const tableNumber = mesa && /^\d+$/.test(mesa) ? Number(mesa) : null;
  const { theme, toggle } = useTheme();
  const [catIndex, setCatIndex] = useState(0);
  const queryClient = useQueryClient();

  const { data: menuCats = [], isLoading } = useQuery({
    queryKey: ["menu-categories"],
    queryFn: async (): Promise<CategoryLite[]> => {
      const { data, error } = await supabase
        .from("menu_categories")
        .select("name, sort_order")
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel("home-categories")
      .on("postgres_changes", { event: "*", schema: "public", table: "menu_categories" }, () => {
        queryClient.invalidateQueries({ queryKey: ["menu-categories"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return (
    <div className="min-h-screen bg-background font-sans">
      {/* Foto del restaurante */}
      <div className="relative h-64 w-full">
        <img
          src="/hero-bg.jpg"
          alt={RESTAURANT.name}
          className="h-full w-full object-cover"
        />
        <button
          onClick={toggle}
          aria-label={theme === "dark" ? "Activar tema claro" : "Activar tema oscuro"}
          className="absolute right-4 top-4 flex size-10 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur"
        >
          {theme === "dark" ? <Sun className="size-5" /> : <Moon className="size-5" />}
        </button>
      </div>

      {/* Logo centrado sobre la foto */}
      <div className="relative z-10 mx-auto -mt-16 w-fit">
        <img
          src="/punto-verde-logo.png"
          alt={RESTAURANT.name}
          className="size-32 rounded-full object-cover shadow-2xl ring-4 ring-background"
        />
      </div>

      {/* Nombre y bienvenida */}
      <div className="px-6 pt-4 text-center">
        <h1 className="font-display text-4xl font-bold uppercase text-foreground">
          {RESTAURANT.name}
        </h1>
        <p className="mt-3 text-lg text-muted-foreground">{RESTAURANT.tagline}</p>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          ¡Bienvenidos! Escoge una categoría para ver nuestra carta.
        </p>
        {tableNumber ? (
          <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-foreground px-4 py-1.5 text-sm font-semibold text-background">
            Mesa <span>{tableNumber}</span>
          </div>
        ) : (
          <p className="mt-4 inline-block rounded-full bg-muted px-4 py-1.5 text-xs text-muted-foreground">
            Para pedir, escanea el código QR que está en tu mesa.
          </p>
        )}
      </div>

      {/* Una categoría a la vez, con flechas para pasar de una a otra */}
      <div className="mt-8 px-5">
        {isLoading && <p className="py-4 text-center text-muted-foreground">Cargando…</p>}

        {!isLoading && menuCats.length > 0 && (
          <>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCatIndex((catIndex - 1 + menuCats.length) % menuCats.length)}
                aria-label="Categoría anterior"
                className="flex size-12 shrink-0 items-center justify-center rounded-full bg-muted text-foreground active:scale-95"
              >
                <ChevronLeft className="size-6" />
              </button>

              <Link
                to="/carta"
                search={{
                  categoria: menuCats[catIndex % menuCats.length].name,
                  ...(tableNumber ? { mesa: String(tableNumber) } : {}),
                }}
                className="flex min-h-[4.5rem] flex-1 items-center justify-between gap-2 rounded-2xl bg-foreground px-6 py-4 font-display text-xl font-bold uppercase tracking-wide text-background"
              >
                {menuCats[catIndex % menuCats.length].name}
                <ChevronRight className="size-6 shrink-0" />
              </Link>

              <button
                onClick={() => setCatIndex((catIndex + 1) % menuCats.length)}
                aria-label="Siguiente categoría"
                className="flex size-12 shrink-0 items-center justify-center rounded-full bg-muted text-foreground active:scale-95"
              >
                <ChevronRight className="size-6" />
              </button>
            </div>
            <p className="mt-3 text-center text-xs text-muted-foreground">
              {(catIndex % menuCats.length) + 1} de {menuCats.length} · toca la tarjeta para ver los
              platos
            </p>
          </>
        )}
      </div>

            <RestaurantFooter />
    </div>
  );
}