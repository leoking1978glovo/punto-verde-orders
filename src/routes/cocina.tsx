import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown, ChevronUp, Clock, CookingPot, Settings2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type TableInfo = {
  id: string;
  table_number: number;
  label: string;
  is_active: boolean;
};

type OrderItem = {
  id: string;
  name: string;
  quantity: number;
  unit_price: number;
};

type ActiveOrder = {
  id: string;
  table_number: number;
  created_at: string;
  order_items: OrderItem[];
};

export const Route = createFileRoute("/cocina")({
  head: () => ({
    meta: [
      { title: "Cocina | Restaurante Punto Verde" },
      {
        name: "description",
        content:
          "Panel de cocina en tiempo real con todas las mesas y los pedidos activos de Restaurante Punto Verde.",
      },
      { property: "og:title", content: "Cocina | Restaurante Punto Verde" },
      {
        property: "og:description",
        content: "Todas las mesas y pedidos activos, en tiempo real.",
      },
    ],
  }),
  component: KitchenPage,
  errorComponent: ({ error }) => (
    <div role="alert" className="p-8 text-center text-sm text-muted-foreground">
      No pudimos cargar los pedidos: {error.message}
    </div>
  ),
  notFoundComponent: () => <div className="p-8 text-center">Sin pedidos.</div>,
});

const currency = (value: number) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 })
    .format(value);

function elapsedLabel(createdAt: string, now: number) {
  const mins = Math.max(0, Math.floor((now - new Date(createdAt).getTime()) / 60000));
  if (mins < 1) return "ahora mismo";
  if (mins === 1) return "hace 1 min";
  return `hace ${mins} min`;
}

function KitchenPage() {
  const queryClient = useQueryClient();
  const [now, setNow] = useState(() => Date.now());
  const [expanded, setExpanded] = useState<string | null>(null);

  // Reloj suave para que el tiempo transcurrido se actualice solo
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const { data: tables = [], isLoading: tablesLoading } = useQuery({
    queryKey: ["tables"],
    queryFn: async (): Promise<TableInfo[]> => {
      const { data, error } = await supabase
        .from("restaurant_tables")
        .select("id, table_number, label, is_active")
        .eq("is_active", true)
        .order("table_number");
      if (error) throw error;
      return (data ?? []) as TableInfo[];
    },
  });

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["active-orders"],
    queryFn: async (): Promise<ActiveOrder[]> => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, table_number, created_at, order_items(id, name, quantity, unit_price)")
        .eq("status", "activo")
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as unknown as ActiveOrder[];
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel("cocina")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => {
        queryClient.invalidateQueries({ queryKey: ["active-orders"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "order_items" }, () => {
        queryClient.invalidateQueries({ queryKey: ["active-orders"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "restaurant_tables" }, () => {
        queryClient.invalidateQueries({ queryKey: ["tables"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const orderByTable = useMemo(() => {
    const map = new Map<number, ActiveOrder>();
    for (const o of orders) map.set(o.table_number, o);
    return map;
  }, [orders]);

  // Pedidos de mesas que ya no están en el grid (p. ej. QR antiguos): se muestran igual
  const knownNumbers = useMemo(() => new Set(tables.map((t) => t.table_number)), [tables]);
  const orphanOrders = useMemo(
    () => orders.filter((o) => !knownNumbers.has(o.table_number)),
    [orders, knownNumbers],
  );

  const activeInGrid = tables.filter((t) => orderByTable.has(t.table_number)).length;
  const freeCount = Math.max(0, tables.length - activeInGrid);

  async function closeOrder(id: string) {
    await supabase.from("orders").update({ status: "servido" }).eq("id", id);
    queryClient.invalidateQueries({ queryKey: ["active-orders"] });
  }

  const renderOrderCard = (order: ActiveOrder, label?: string) => {
    const total = order.order_items.reduce((sum, i) => sum + Number(i.unit_price) * i.quantity, 0);
    const count = order.order_items.reduce((sum, i) => sum + i.quantity, 0);
    const open = expanded === order.id;
    return (
      <li
        key={order.id}
        className="rounded-2xl border-2 border-primary bg-card p-4 shadow-sm"
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="font-display text-2xl leading-none">
              {label ?? `Mesa ${order.table_number}`}
            </h2>
            {label && label !== `Mesa ${order.table_number}` && (
              <p className="mt-0.5 text-xs text-muted-foreground">Mesa {order.table_number}</p>
            )}
          </div>
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
            <Clock className="size-3" />
            {elapsedLabel(order.created_at, now)}
          </span>
        </div>

        <p className="mt-2 text-sm text-muted-foreground">
          {count} ítem(s) ·{" "}
          <span className="font-semibold text-card-foreground">{currency(total)}</span>
        </p>

        {order.order_items.length > 0 && (
          <button
            onClick={() => setExpanded(open ? null : order.id)}
            className="mt-2 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-primary"
          >
            {open ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
            {open ? "Ocultar ítems" : "Ver ítems"}
          </button>
        )}

        {open && (
          <ul className="mt-2 space-y-1.5 border-t border-border pt-2">
            {order.order_items.map((item) => (
              <li key={item.id} className="flex justify-between text-sm">
                <span className="text-card-foreground">
                  <span className="mr-2 inline-flex min-w-6 justify-center rounded-md bg-accent px-1.5 font-semibold text-accent-foreground">
                    {item.quantity}
                  </span>
                  {item.name}
                </span>
                <span className="text-muted-foreground">
                  {currency(Number(item.unit_price) * item.quantity)}
                </span>
              </li>
            ))}
          </ul>
        )}

        <button
          onClick={() => closeOrder(order.id)}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-primary py-2.5 text-sm font-semibold text-primary-foreground active:scale-[0.99]"
        >
          <Check className="size-4" /> Marcar servido / cerrar
        </button>
      </li>
    );
  };

  return (
    <div className="min-h-screen bg-background font-sans pb-12">
      <header className="relative overflow-hidden rounded-b-[2rem] bg-deep text-primary-foreground">
        <img
          src="/hero-bg.jpg"
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full object-cover opacity-60"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-ink/70 via-ink/30 to-ink/85" />

        <div className="relative px-5 pb-8 pt-8">
          <div className="flex items-center justify-between gap-3">
            <img
              src="/punto-verde-logo.png"
              alt="Restaurante Punto Verde"
              className="size-14 rounded-full object-cover shadow-lg ring-2 ring-white/25"
            />
            <div className="flex items-center gap-2">
              <div className="rounded-full bg-white/15 px-4 py-1.5 text-sm backdrop-blur">
                {orders.length} pedido(s) activo(s)
              </div>
              <Link
                to="/admin"
                aria-label="Gestionar mesas"
                className="flex size-10 items-center justify-center rounded-full bg-white/15 backdrop-blur"
              >
                <Settings2 className="size-5" />
              </Link>
            </div>
          </div>

          <p className="mt-5 text-xs font-semibold uppercase tracking-[0.35em] text-[#F7C137]">
            Panel de cocina · · Tiempo real
          </p>
          <h1 className="mt-2 font-display text-4xl uppercase leading-[0.95] text-white">
            Cocina
          </h1>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-white/15 p-3 backdrop-blur">
              <p className="text-xs uppercase tracking-wide text-white/70">Con pedido</p>
              <p className="mt-1 font-display text-2xl">{orders.length}</p>
            </div>
            <div className="rounded-2xl bg-white/15 p-3 backdrop-blur">
              <p className="text-xs uppercase tracking-wide text-white/70">Mesas libres</p>
              <p className="mt-1 font-display text-2xl">{freeCount}</p>
            </div>
          </div>
        </div>
      </header>

      <main className="px-5">
        {(isLoading || tablesLoading) && (
          <p className="py-10 text-center text-muted-foreground">Cargando mesas…</p>
        )}

        {!isLoading && !tablesLoading && tables.length === 0 && (
          <div className="mt-10 rounded-3xl border border-dashed border-clay/60 bg-sand p-8 text-center">
            <p className="font-display text-xl">No hay mesas configuradas</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Añade tus mesas (y las que vayas necesitando) desde Administración.
            </p>
            <Link
              to="/admin"
              className="mt-4 inline-block rounded-full bg-primary px-6 py-3 font-semibold text-primary-foreground"
            >
              Ir a Administración
            </Link>
          </div>
        )}

        {tables.length > 0 && (
          <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {tables.map((table) => {
              const order = orderByTable.get(table.table_number);
              if (order) return renderOrderCard(order, table.label);
              return (
                <li
                  key={table.id}
                  className="rounded-2xl border border-dashed border-border bg-secondary/40 p-4"
                >
                  <p className="font-display text-xl text-muted-foreground">{table.label}</p>
                  <p className="mt-1 text-xs uppercase tracking-wide text-muted-foreground/70">
                    Libre
                  </p>
                  <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground/70">
                    <CookingPot className="size-4" /> Sin pedido
                  </div>
                </li>
              );
            })}
            {orphanOrders.map((order) => renderOrderCard(order))}
          </ul>
        )}

        <div className="mt-10 text-center">
          <Link to="/" className="text-xs uppercase tracking-widest text-muted-foreground">
            Ir al menú del cliente
          </Link>
        </div>
      </main>
    </div>
  );
}