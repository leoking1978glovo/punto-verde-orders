import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Leaf, Minus, Plus, ShoppingBag, Check, ChefHat } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type MenuItem = {
  id: string;
  category: string;
  name: string;
  description: string;
  price: number;
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

function MenuPage() {
  const { mesa } = Route.useSearch();
  const tableNumber = mesa && /^\d+$/.test(mesa) ? Number(mesa) : null;

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["menu"],
    queryFn: async (): Promise<MenuItem[]> => {
      const { data, error } = await supabase
        .from("menu_items")
        .select("id, category, name, description, price, sort_order")
        .eq("available", true)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []).map((d) => ({ ...d, price: Number(d.price) }));
    },
  });

  const categories = useMemo(() => {
    const map = new Map<string, MenuItem[]>();
    for (const item of items) {
      map.set(item.category, [...(map.get(item.category) ?? []), item]);
    }
    return [...map.entries()];
  }, [items]);

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
    <div className="min-h-screen bg-background font-sans pb-40">
      <header className="bg-deep px-5 pb-8 pt-10 text-primary-foreground rounded-b-[2rem]">
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-primary-foreground/70">
          <Leaf className="size-4" />
          Cocina fresca y natural
        </div>
        <h1 className="mt-3 font-display text-4xl leading-tight">Restaurante Punto Verde</h1>
        <p className="mt-2 text-sm text-primary-foreground/80">
          {tableNumber
            ? `Estás pidiendo desde la mesa ${tableNumber}.`
            : "Escanea el código QR de tu mesa para pedir."}
        </p>
        {tableNumber && (
          <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-primary-foreground/15 px-4 py-1.5 text-sm">
            Mesa <span className="font-semibold">{tableNumber}</span>
          </div>
        )}
      </header>

      {!tableNumber && (
        <div className="mx-5 mt-5 rounded-2xl border border-clay/40 bg-sand p-4 text-sm text-secondary-foreground">
          Abre el enlace con el número de tu mesa, por ejemplo{" "}
          <span className="font-semibold">?mesa=5</span>, para poder confirmar el pedido.
          <div className="mt-3 flex flex-wrap gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <Link
                key={n}
                to="/"
                search={{ mesa: String(n) }}
                className="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground"
              >
                Mesa {n}
              </Link>
            ))}
          </div>
        </div>
      )}

      <main className="px-5">
        {isLoading && <p className="py-10 text-center text-muted-foreground">Cargando menú…</p>}

        {categories.map(([category, list]) => (
          <section key={category} className="mt-8">
            <h2 className="font-display text-2xl text-foreground">{category}</h2>
            <div className="mt-1 h-px w-16 bg-clay" />
            <ul className="mt-4 space-y-3">
              {list.map((item) => (
                <li
                  key={item.id}
                  className="rounded-2xl border border-border bg-card p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-card-foreground">{item.name}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
                      <p className="mt-2 font-display text-lg text-primary">
                        {currency(item.price)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {(cart[item.id] ?? 0) > 0 && (
                        <>
                          <button
                            aria-label={`Quitar ${item.name}`}
                            onClick={() => add(item.id, -1)}
                            className="flex size-9 items-center justify-center rounded-full border border-border text-foreground"
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
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}

        <div className="mt-10 text-center">
          <Link
            to="/cocina"
            className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground"
          >
            <ChefHat className="size-4" /> Vista de cocina
          </Link>
        </div>
      </main>

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
              className="mt-5 w-full rounded-full bg-primary py-3 font-semibold text-primary-foreground"
            >
              Seguir pidiendo
            </button>
          </div>
        </div>
      )}

      {count > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-card/95 p-4 backdrop-blur">
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
            disabled={!tableNumber || sending}
            onClick={confirmOrder}
            className="flex w-full items-center justify-between rounded-full bg-primary px-6 py-4 font-semibold text-primary-foreground disabled:opacity-50"
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
