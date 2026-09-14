import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Check,
  Flame,
  Leaf,
  Minus,
  Plus,
  ShoppingBag,
  Sprout,
  WheatOff,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { RESTAURANT } from "@/lib/restaurant";
import { RestaurantFooter } from "@/components/RestaurantFooter";

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

export const Route = createFileRoute("/carta")({
  validateSearch: (search: Record<string, unknown>): { categoria?: string; mesa?: string } => ({
    categoria: search["categoria"] != null ? String(search["categoria"]) : undefined,
    mesa: search["mesa"] != null ? String(search["mesa"]) : undefined,
  }),

  head: () => ({
    meta: [
      { title: "Carta | Restaurante Punto Verde" },
      { name: "description", content: `Carta de ${RESTAURANT.name}.` },
    ],
  }),
  component: CartaPage,
  errorComponent: ({ error }) => (
    <div role="alert" className="p-8 text-center text-sm text-muted-foreground">
      No pudimos cargar la carta: {error.message}
    </div>
  ),
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

function CartaPage() {
  const { categoria, mesa } = Route.useSearch();
  const tableNumber = mesa && /^\d+$/.test(mesa) ? Number(mesa) : null;
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
      .channel("carta")
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

  // ── Solo UNA categoría visible a la vez ──
  const [activeCategory, setActiveCategory] = useState<string | null>(categoria ?? null);
  const visibleCategory =
    activeCategory && groups.some(([n]) => n === activeCategory)
      ? activeCategory
      : (groups[0]?.[0] ?? null);

  // ── Carrito (solo con mesa) ──
  const [cart, setCart] = useState<Record<string, number>>({});
  const [sending, setSending] = useState(false);
  const [confirmed, setConfirmed] = useState<null | { total: number; count: number; ahead: number }>(null);
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

      const wasExisting = !!existing?.id;
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
            .update({ quantity: match.quantity + line.qty, added_at: new Date().toISOString() })
            .eq("id", match.id);
          if (updError) throw updError;
        } else {
          const { error: insError } = await supabase.from("order_items").insert({
            order_id: orderId,
            menu_item_id: line.item.id,
            name: line.item.name,
            unit_price: line.item.price,
            quantity: line.qty,
            added_at: new Date().toISOString(),
          });
          if (insError) throw insError;
        }
      }

      await supabase
        .from("orders")
        .update(
          wasExisting
            ? { status: "activo", items_updated_at: new Date().toISOString() }
            : { status: "activo" },
        )
        .eq("id", orderId);

      // ¿Cuántos pedidos activos hay por delante de este?
      const { data: mine } = await supabase
        .from("orders")
        .select("created_at, items_updated_at")
        .eq("id", orderId)
        .single();
      const { data: actives } = await supabase
        .from("orders")
        .select("table_number, created_at, items_updated_at")
        .eq("status", "activo");
      const keyOf = (o: { created_at: string; items_updated_at: string | null }) =>
        o.items_updated_at ?? o.created_at;
      const myKey = mine ? keyOf(mine) : new Date().toISOString();
      const ahead = (actives ?? []).filter(
        (o) => o.table_number !== tableNumber && keyOf(o) < myKey,
      ).length;

      setConfirmed({ total, count, ahead });
      setCart({});
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos enviar tu pedido.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="min-h-screen bg-background font-sans">
      {/* Cabecera: volver + nombre */}
      <div className="flex items-center gap-3 px-4 pt-5">
        <Link
          to="/"
          search={tableNumber ? { mesa: String(tableNumber) } : {}}
          aria-label="Volver"
          className="flex size-10 items-center justify-center rounded-full bg-muted text-foreground"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <h1 className="font-display text-2xl font-bold uppercase text-foreground">
          {RESTAURANT.name}
        </h1>
        {tableNumber && (
          <span className="ml-auto rounded-full bg-foreground px-3 py-1 text-xs font-semibold text-background">
            Mesa {tableNumber}
          </span>
        )}
      </div>

      {/* Chips de categorías */}
      {groups.length > 0 && (
        <nav className="sticky top-0 z-10 mt-4 border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
          <ul className="flex gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none]">
            {groups.map(([category]) => (
              <li key={category}>
                <button
                  onClick={() => setActiveCategory(category)}
                  className={`whitespace-nowrap rounded-full border px-4 py-1.5 text-sm font-semibold transition-colors ${
                    activeCategory === category
                      ? "border-foreground bg-foreground text-background"
                      : "border-border bg-background text-foreground"
                  }`}
                >
                  {category}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      )}

      {/* Secciones de la carta */}
      <main>
        {isLoading && <p className="py-10 text-center text-muted-foreground">Cargando carta…</p>}

        {groups.map(([category, list]) =>
          category !== visibleCategory ? null : (
          <section key={category} className="scroll-mt-32">
            <h2 className="mt-6 bg-muted px-5 py-2.5 font-display text-2xl font-bold text-foreground">
              {category}
            </h2>
            <ul className="divide-y divide-border">
              {list.map((item) => (
                <li key={item.id} className="flex items-start gap-4 px-5 py-4">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-lg font-bold text-card-foreground">{item.name}</h3>
                    {item.description && (
                      <p className="mt-0.5 text-sm text-muted-foreground">{item.description}</p>
                    )}
                    <p className="mt-1 text-base font-bold text-foreground">
                      {currency(item.price)}
                    </p>
                    {item.tags?.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
                        {item.tags.map((tag) => (
                          <TagChip key={tag} tag={tag} />
                        ))}
                      </div>
                    )}

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
                          className="flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground transition-transform active:scale-95"
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
                      className="size-24 shrink-0 rounded-xl object-cover"
                    />
                  ) : (
                    <div className="flex size-24 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                      <Leaf className="size-6" />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
          ),
        )}

        {/* Notas de la carta */}
        <div className="mt-8 space-y-1 px-5 text-sm text-muted-foreground">
          {RESTAURANT.menuNotes.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      </main>

      <RestaurantFooter />

      {/* Confirmación */}
      {confirmed && (
        <div className="fixed inset-0 z-20 flex items-end bg-foreground/40 p-4">
          <div className="w-full rounded-3xl bg-card p-6 text-center">
            <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Check className="size-7" />
            </div>
            <h2 className="mt-4 font-display text-2xl">¡Pedido enviado!</h2>
            {confirmed.ahead > 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                {confirmed.count} ítem(s) por {currency(confirmed.total)} se sumaron a tu pedido.
                Hay clientes por delante de ti: debes esperar un poco, la cocina lo preparará en
                cuanto termine los pedidos anteriores. Gracias por tu paciencia.
              </p>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                {confirmed.count} ítem(s) por {currency(confirmed.total)} se sumaron a tu pedido.
                ¡El tuyo es el siguiente en la cocina!
              </p>
            )}
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