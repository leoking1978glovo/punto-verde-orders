import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  ChevronRight,
  Flame,
  Leaf,
  Minus,
  Moon,
  Plus,
  ShoppingBag,
  Sprout,
  Sun,
  WheatOff,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTheme } from "@/lib/theme";

type MenuItem = {
  id: string;
  category: string;
  name: string;
  description: string;
  price: number;
  sort_order: number;
  image_url: string;
  tags: string[];
};

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
  component: MenuPage,
  errorComponent: ({ error }) => (
    <div role="alert" className="p-8 text-center text-sm text-muted-foreground">
      No pudimos cargar el menú: {error.message}
    </div>
  ),
  notFoundComponent: () => <div className="p-8 text-center">Menú no disponible.</div>,
});

const currency = (value: number) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 })
    .format(value);

const TAG_META: Record<string, { icon: typeof Sprout; className: string }> = {
  Vegano: { icon: Sprout, className: "text-[#5F7A3A]" },
  "Sin gluten": { icon: WheatOff, className: "text-[#C2703D]" },
  Picante: { icon: Flame, className: "text-destructive" },
};

function TagChip({ tag }: { tag: string }) {
  const meta = TAG_META[tag];
  const Icon = meta?.icon ?? Leaf;
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
      <Icon className={`size-4 ${meta?.className ?? ""}`} />
      {tag}
    </span>
  );
}

function MenuPage() {
  const { mesa } = Route.useSearch();
  const tableNumber = mesa && /^\d+$/.test(mesa) ? Number(mesa) : null;
  const { theme, toggle } = useTheme();
  const queryClient = useQueryClient();

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["menu"],
    queryFn: async (): Promise<MenuItem[]> => {
      const { data, error } = await supabase
        .from("menu_items")
        .select("id, category, name, description, price, sort_order, image_url, tags")
        .eq("available", true)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []).map((d) => ({ ...d, price: Number(d.price) }));
    },
  });

  const { data: menuCats = [] } = useQuery({
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
      .channel("menu-cliente")
      .on("postgres_changes", { event: "*", schema: "public", table: "menu_items" }, () => {
        queryClient.invalidateQueries({ queryKey: ["menu"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "menu_categories" }, () => {
        queryClient.invalidateQueries({ queryKey: ["menu-categories"] });
        queryClient.invalidateQueries({ queryKey: ["menu"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const groups = useMemo(() => {
    const map = new Map<string, MenuItem[]>();
    for (const item of items) {
      map.set(item.category, [...(map.get(item.category) ?? []), item]);
    }
    const rank = new Map(menuCats.map((c, i) => [c.name, i]));
    return [...map.entries()].sort((a, b) => {
      const ia = rank.get(a[0]);
      const ib = rank.get(b[0]);
      return (ia ?? 999) - (ib ?? 999);
    });
  }, [items, menuCats]);

  const [selected, setSelected] = useState<string | null>(null);
  const activeCategory = selected ?? groups[0]?.[0] ?? null;

  // ── Carrito (solo cuando hay mesa) ──
  const [cart, setCart] = useState<Record<string, number>>({});
  const [sending, setSending] = useState(false);
  const [confirmed, setConfirmed] = useState<null | { total: number; count: number }>(null);
  const [error, setError] = useState<string | null>(null);

  const cartLines = items
    .filter((i) => (cart[i.id] ?? 0) > 0)
    .map((i) => ({ item: i, qty: cart[i.id] as number }));
  const total = cartLines.reduce((sum, l) => sum + l.item.price * l.qty, 0);
  const count = cartLines.reduce((sum, l) => sum + l.qty, 0);

  const add = (id: string, delta: number) =>
    setCart((prev) => {
      const next = Math.max(0, (prev[id] ?? 0) + delta);
      const copy = { ...prev };
      if (next === 0) delete copy[id];
      else copy[id] = next;
      return copy;
    });

  async function confirmOrder() {
    if (!tableNumber || cartLines.length === 0) return;
    setSending(true);
    setError(null);
    try {
      const { data: existing, error: findError } = await supabase
        .from("orders")
        .select("id")
        .eq("table_number", tableNumber)
        .eq("status", "activo")
        .maybeSingle();
      if (findError) throw findError;

      let orderId = existing?.id ?? null;
      if (!orderId) {
        const { data: created, error: createError } = await supabase
          .from("orders")
          .insert({ table_number: tableNumber, status: "activo" })
          .select("id")
          .single();
        if (createError) throw createError;
        orderId = created.id;
      }

      const { data: currentItems, error: itemsError } = await supabase
        .from("order_items")
        .select("id, menu_item_id, quantity")
        .eq("order_id", orderId);
      if (itemsError) throw itemsError;

      for (const line of cartLines) {
        const match = (currentItems ?? []).find((ci) => ci.menu_item_id === line.item.id);
        if (match) {
          const { error: updError } = await supabase
            .from("order_items")
            .update({ quantity: match.quantity + line.qty })
            .eq("id", match.id);
          if (updError) throw updError;
        } else {
          const { error: insError } = await supabase.from("order_items").insert({
            order_id: orderId,
            menu_item_id: line.item.id,
            name: line.item.name,
            unit_price: line.item.price,
            quantity: line.qty,
          });
          if (insError) throw insError;
        }
      }

      await supabase.from("orders").update({ status: "activo" }).eq("id", orderId);

      setConfirmed({ total, count });
      setCart({});
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos enviar tu pedido.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="min-h-screen bg-background font-sans">
      {/* Foto del restaurante */}
      <div className="relative h-64 w-full">
        <img
          src="/hero-bg.jpg"
          alt="Restaurante Punto Verde"
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

      {/* Nombre y bienvenida */}
      <div className="px-6 pt-6 text-center">
        <h1 className="font-display text-4xl font-bold uppercase text-foreground">
          Restaurante Punto Verde
        </h1>
        <p className="mt-3 text-lg text-muted-foreground">Cocina fresca, natural y de temporada.</p>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          ¡Bienvenidos! Escoge una categoría para ver nuestros platos.
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

      {/* Botones de categorías */}
      <div className="mt-8 space-y-3 px-5">
        {isLoading && <p className="py-4 text-center text-muted-foreground">Cargando menú…</p>}

        {groups.map(([category]) => {
          const open = category === activeCategory;
          return (
            <button
              key={category}
              onClick={() => setSelected(open ? null : category)}
              className={`flex w-full items-center justify-between rounded-2xl px-6 py-4 text-left font-display text-xl font-bold uppercase tracking-wide transition-colors ${
                open
                  ? "bg-foreground text-background"
                  : "bg-muted text-foreground hover:bg-muted/70"
              }`}
            >
              {category}
              <ChevronRight className={`size-6 transition-transform ${open ? "rotate-90" : ""}`} />
            </button>
          );
        })}
      </div>

      {/* Platos de la categoría elegida */}
      {activeCategory && (
        <section className="mt-8 px-5">
          <h2 className="font-display text-3xl font-bold text-foreground">{activeCategory}</h2>
          <div className="mt-1 h-px w-16 bg-clay" />

          <ul className="mt-2 divide-y divide-border">
            {(groups.find(([c]) => c === activeCategory)?.[1] ?? []).map((item) => (
              <li key={item.id} className="flex items-start gap-4 py-5">
                <div className="min-w-0 flex-1">
                  <h3 className="text-xl font-bold text-card-foreground">{item.name}</h3>
                  {item.description && (
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                      {item.description}
                    </p>
                  )}
                  {item.tags?.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                      {item.tags.map((tag) => (
                        <TagChip key={tag} tag={tag} />
                      ))}
                    </div>
                  )}
                  <p className="mt-2 font-display text-lg font-semibold text-primary">
                    {currency(item.price)}
                  </p>

                  {tableNumber && (
                    <div className="mt-3 flex items-center gap-3">
                      {(cart[item.id] ?? 0) > 0 && (
                        <>
                          <button
                            aria-label={`Quitar ${item.name}`}
                            onClick={() => add(item.id, -1)}
                            className="flex size-9 items-center justify-center rounded-full border border-border text-foreground active:scale-95"
                          >
                            <Minus className="size-4" />
                          </button>
                          <span className="w-4 text-center font-semibold">{cart[item.id]}</span>
                        </>
                      )}
                      <button
                        aria-label={`Agregar ${item.name}`}
                        onClick={() => add(item.id, 1)}
                        className="flex size-9 items-center justify-center rounded-full bg-foreground text-background transition-transform active:scale-95"
                      >
                        <Plus className="size-4" />
                      </button>
                    </div>
                  )}
                </div>

                {item.image_url ? (
                  <img
                    src={item.image_url}
                    alt={item.name}
                    loading="lazy"
                    width={768}
                    height={576}
                    className="size-28 shrink-0 rounded-2xl object-cover"
                  />
                ) : (
                  <div className="flex size-28 shrink-0 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
                    <Leaf className="size-6" />
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-10 flex justify-center gap-6 pb-12">
        <Link to="/cocina" className="text-xs uppercase tracking-widest text-muted-foreground">
          Cocina
        </Link>
        <Link to="/admin" className="text-xs uppercase tracking-widest text-muted-foreground">
          Administración
        </Link>
      </div>

      {/* Confirmación */}
      {confirmed && (
        <div className="fixed inset-0 z-20 flex items-end bg-foreground/40 p-4">
          <div className="w-full rounded-3xl bg-card p-6 text-center">
            <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Check className="size-7" />
            </div>
            <h2 className="mt-4 font-display text-2xl">¡Pedido enviado!</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {confirmed.count} ítem(s) por {currency(confirmed.total)} se sumaron al pedido de la
              mesa {tableNumber}. La cocina ya lo está viendo.
            </p>
            <button
              onClick={() => setConfirmed(null)}
              className="mt-5 w-full rounded-full bg-foreground py-3 font-semibold text-background"
            >
              Seguir pidiendo
            </button>
          </div>
        </div>
      )}

      {/* Barra del carrito */}
      {tableNumber && count > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-card/95 p-4 backdrop-blur">
          <div className="mb-3 max-h-32 space-y-1 overflow-y-auto text-sm">
            {cartLines.map((l) => (
              <div key={l.item.id} className="flex justify-between text-muted-foreground">
                <span>
                  {l.qty} × {l.item.name}
                </span>
                <span>{currency(l.qty * l.item.price)}</span>
              </div>
            ))}
          </div>
          {error && <p className="mb-2 text-sm text-destructive">{error}</p>}
          <button
            disabled={sending}
            onClick={confirmOrder}
            className="flex w-full items-center justify-between rounded-full bg-foreground px-6 py-4 font-semibold text-background disabled:opacity-50"
          >
            <span className="flex items-center gap-2">
              <ShoppingBag className="size-5" />
              {sending ? "Enviando…" : `Confirmar pedido (${count})`}
            </span>
            <span>{currency(total)}</span>
          </button>
        </div>
      )}
    </div>
  );
}