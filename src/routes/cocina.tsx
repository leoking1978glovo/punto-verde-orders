import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BookOpen,
  Check,
  Clock,
  CookingPot,
  Eye,
  Minus,
  Plus,
  Printer,
  Settings2,
  ShoppingBag,
  X,
} from "lucide-react";
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

const QUICK_CATEGORY_ORDER = ["Entradas", "Platos fuertes", "Bebidas", "Postres"];

const currency = (value: number) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 })
    .format(value);

function elapsedLabel(createdAt: string, now: number) {
  const mins = Math.max(0, Math.floor((now - new Date(createdAt).getTime()) / 60000));
  if (mins < 1) return "ahora mismo";
  if (mins === 1) return "hace 1 min";
  return `hace ${mins} min`;
}

function orderTotal(order: ActiveOrder) {
  return order.order_items.reduce((sum, i) => sum + Number(i.unit_price) * i.quantity, 0);
}

function printTicket(order: ActiveOrder) {
  const total = orderTotal(order);
  const fecha = new Date(order.created_at).toLocaleString("es-CO", {
    dateStyle: "short",
    timeStyle: "short",
  });
  const filas = order.order_items
    .map(
      (item) => `
      <tr>
        <td class="qty">${item.quantity}</td>
        <td>${item.name}</td>
        <td class="right">${currency(Number(item.unit_price) * item.quantity)}</td>
      </tr>`
    )
    .join("");

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Comanda - Mesa ${order.table_number}</title>
  <style>
    body { font-family: Arial, sans-serif; width: 280px; margin: 0 auto; padding: 12px; color: #000; }
    h1 { font-size: 16px; text-align: center; margin: 0; }
    .sub { font-size: 11px; text-align: center; color: #444; margin: 2px 0 8px; }
    .meta { font-size: 12px; display: flex; justify-content: space-between; margin-bottom: 6px; }
    hr { border: none; border-top: 1px dashed #000; margin: 6px 0; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    td { padding: 3px 0; vertical-align: top; }
    .qty { width: 24px; font-weight: bold; }
    .right { text-align: right; white-space: nowrap; }
    .total { font-size: 14px; font-weight: bold; display: flex; justify-content: space-between; margin-top: 4px; }
    .pie { font-size: 10px; text-align: center; color: #444; margin-top: 10px; }
  </style>
</head>
<body>
  <h1>RESTAURANTE PUNTO VERDE</h1>
  <p class="sub">Cocina fresca y natural</p>
  <div class="meta"><span>Mesa: <b>${order.table_number}</b></span><span>${fecha}</span></div>
  <hr />
  <table>${filas}</table>
  <hr />
  <div class="total"><span>TOTAL</span><span>${currency(total)}</span></div>
  <p class="pie">Comanda de cocina</p>
  <script>window.onload = function() { window.print(); };</script>
</body>
</html>`;

  const win = window.open("", "_blank", "width=400,height=600");
  if (!win) {
    alert("El navegador bloqueó la ventana de impresión. Permite ventanas emergentes para este sitio.");
    return;
  }
  win.document.write(html);
  win.document.close();
}

function KitchenPage() {
  const queryClient = useQueryClient();
  const [now, setNow] = useState(() => Date.now());
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [menuTable, setMenuTable] = useState<number | null>(null);
  const [menuCart, setMenuCart] = useState<Record<string, number>>({});
  const [quickSending, setQuickSending] = useState(false);

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

  const { data: menuItems = [] } = useQuery({
    queryKey: ["quick-menu"],
    queryFn: async (): Promise<
      { id: string; category: string; name: string; price: number; sort_order: number }[]
    > => {
      const { data, error } = await supabase
        .from("menu_items")
        .select("id, category, name, price, sort_order")
        .eq("available", true)
        .order("category")
        .order("sort_order");
      if (error) throw error;
      return (data ?? []).map((d) => ({ ...d, price: Number(d.price) }));
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
      .on("postgres_changes", { event: "*", schema: "public", table: "menu_items" }, () => {
        queryClient.invalidateQueries({ queryKey: ["quick-menu"] });
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

  const knownNumbers = useMemo(() => new Set(tables.map((t) => t.table_number)), [tables]);
  const orphanOrders = useMemo(
    () => orders.filter((o) => !knownNumbers.has(o.table_number)),
    [orders, knownNumbers]
  );

  const quickGroups = useMemo(() => {
    const map = new Map<string, typeof menuItems>();
    for (const item of menuItems) {
      map.set(item.category, [...(map.get(item.category) ?? []), item]);
    }
    return [...map.entries()].sort((a, b) => {
      const ia = QUICK_CATEGORY_ORDER.indexOf(a[0]);
      const ib = QUICK_CATEGORY_ORDER.indexOf(b[0]);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
  }, [menuItems]);

  const freeCount = Math.max(0, tables.length - orders.length);

  const selectedOrder = useMemo(
    () => orders.find((o) => o.id === selectedOrderId) ?? null,
    [orders, selectedOrderId]
  );

  useEffect(() => {
    if (selectedOrderId && !selectedOrder) setSelectedOrderId(null);
  }, [selectedOrderId, selectedOrder]);

  async function closeOrder(id: string) {
    await supabase.from("orders").update({ status: "servido" }).eq("id", id);
    setSelectedOrderId(null);
    queryClient.invalidateQueries({ queryKey: ["active-orders"] });
  }

  function confirmClose(order: ActiveOrder) {
    if (
      window.confirm(
        `¿Confirmar que la Mesa ${order.table_number} ya fue servida?\n\nEl pedido se cerrará y pasará al historial de tickets.`
      )
    ) {
      closeOrder(order.id);
    }
  }

  const quickLines = menuItems
    .filter((i) => (menuCart[i.id] ?? 0) > 0)
    .map((i) => ({ item: i, qty: menuCart[i.id] as number }));
  const quickTotal = quickLines.reduce((s, l) => s + l.item.price * l.qty, 0);
  const quickCount = quickLines.reduce((s, l) => s + l.qty, 0);

  async function confirmQuickAdd() {
    if (menuTable == null || quickLines.length === 0) return;
    setQuickSending(true);
    try {
      const { data: existing, error: findError } = await supabase
        .from("orders")
        .select("id")
        .eq("table_number", menuTable)
        .eq("status", "activo")
        .maybeSingle();
      if (findError) throw findError;

      let orderId = existing?.id ?? null;
      if (!orderId) {
        const { data: created, error: createError } = await supabase
          .from("orders")
          .insert({ table_number: menuTable, status: "activo" })
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

      for (const line of quickLines) {
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
      queryClient.invalidateQueries({ queryKey: ["active-orders"] });
      setMenuCart({});
      setMenuTable(null);
    } finally {
      setQuickSending(false);
    }
  }

  const renderOrderCard = (order: ActiveOrder, label?: string) => {
    const total = orderTotal(order);
    const count = order.order_items.reduce((sum, i) => sum + i.quantity, 0);
    return (
      <li
        key={order.id}
        className="flex min-h-[8.5rem] flex-col rounded-2xl border-2 border-primary bg-card p-4 shadow-sm"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <h2 className="font-display text-2xl leading-none">
              {label ?? `Mesa ${order.table_number}`}
            </h2>
            <button
              onClick={() => setMenuTable(order.table_number)}
              aria-label={`Abrir menú para la mesa ${order.table_number}`}
              className="flex items-center gap-1 rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-secondary-foreground active:scale-95"
            >
              <BookOpen className="size-3.5" /> Menú
            </button>
          </div>
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
            <Clock className="size-3" />
            {elapsedLabel(order.created_at, now)}
          </span>
        </div>

        {label && label !== `Mesa ${order.table_number}` && (
          <p className="mt-0.5 text-xs text-muted-foreground">Mesa {order.table_number}</p>
        )}

        <p className="mt-2 text-sm text-muted-foreground">
          {count} ítem(s) ·{" "}
          <span className="font-semibold text-card-foreground">{currency(total)}</span>
        </p>

        <div className="mt-auto pt-3">
          <button
            onClick={() => setSelectedOrderId(order.id)}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-primary py-2 text-sm font-semibold text-primary-foreground active:scale-[0.99]"
          >
            <Eye className="size-4" /> Ver pedido
          </button>
        </div>
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
                  className="flex min-h-[8.5rem] flex-col rounded-2xl border border-dashed border-border bg-secondary/40 p-4"
                >
                  <p className="font-display text-xl text-muted-foreground">{table.label}</p>
                  <p className="mt-1 text-xs uppercase tracking-wide text-muted-foreground/70">
                    Libre
                  </p>
                  <div className="mt-auto pt-3">
                    <button
                      onClick={() => setMenuTable(table.table_number)}
                      aria-label={`Abrir menú para ${table.label}`}
                      className="flex w-full items-center justify-center gap-2 rounded-full bg-secondary py-2 text-sm font-semibold text-secondary-foreground active:scale-[0.99]"
                    >
                      <BookOpen className="size-4" /> Menú
                    </button>
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

      {/* Ventana flotante en miniatura: añadir productos a la mesa elegida */}
      {menuTable != null && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-ink/60 p-4 backdrop-blur-sm"
          onClick={() => {
            setMenuTable(null);
            setMenuCart({});
          }}
        >
          <div
            className="flex max-h-[85vh] w-full max-w-md flex-col rounded-3xl bg-card p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-2xl leading-none">
                  Añadir · Mesa {menuTable}
                </h2>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {(() => {
                    const o = orderByTable.get(menuTable);
                    if (o && o.order_items.length > 0) {
                      const n = o.order_items.reduce((s, i) => s + i.quantity, 0);
                      return `Pedido actual: ${n} ítem(s) · ${currency(orderTotal(o))}`;
                    }
                    return "Sin pedido todavía — esto creará el pedido";
                  })()}
                </p>
              </div>
              <button
                onClick={() => {
                  setMenuTable(null);
                  setMenuCart({});
                }}
                aria-label="Cerrar"
                className="flex size-9 items-center justify-center rounded-full bg-secondary text-secondary-foreground"
              >
                <X className="size-4" />
              </button>
            </div>

            <ul className="mt-4 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
              {quickGroups.map(([category, list]) => (
                <li key={category}>
                  <p className="mb-1.5 mt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground first:mt-0">
                    {category}
                  </p>
                  <ul className="space-y-2">
                    {list.map((item) => (
                      <li
                        key={item.id}
                  className="flex items-center justify-between gap-2 rounded-xl border border-border bg-background px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-card-foreground">{item.name}</p>
                    <p className="text-xs text-muted-foreground">{currency(item.price)}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {(menuCart[item.id] ?? 0) > 0 && (
                      <>
                        <button
                          onClick={() =>
                            setMenuCart((prev) => {
                              const next = Math.max(0, (prev[item.id] ?? 0) - 1);
                              const copy = { ...prev };
                              if (next === 0) delete copy[item.id];
                              else copy[item.id] = next;
                              return copy;
                            })
                          }
                          aria-label={`Quitar ${item.name}`}
                          className="flex size-7 items-center justify-center rounded-full border border-border text-foreground active:scale-95"
                        >
                          <Minus className="size-3.5" />
                        </button>
                        <span className="w-4 text-center text-sm font-semibold">
                          {menuCart[item.id]}
                        </span>
                      </>
                    )}
                    <button
                      onClick={() =>
                        setMenuCart((prev) => ({ ...prev, [item.id]: (prev[item.id] ?? 0) + 1 }))
                      }
                      aria-label={`Añadir ${item.name}`}
                      className="flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground active:scale-95"
                    >
                      <Plus className="size-3.5" />
                    </button>
                  </div>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>

            <div className="mt-4 border-t border-border pt-3">
              <div className="flex justify-between text-sm font-semibold text-card-foreground">
                <span>Total a añadir</span>
                <span>{currency(quickTotal)}</span>
              </div>
              <button
                disabled={quickCount === 0 || quickSending}
                onClick={confirmQuickAdd}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3 text-sm font-semibold text-primary-foreground active:scale-[0.99] disabled:opacity-50"
              >
                <ShoppingBag className="size-4" />
                {quickSending
                  ? "Añadiendo…"
                  : quickCount === 0
                    ? "Elige productos"
                    : `Añadir ${quickCount} ítem(s) a la mesa ${menuTable}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedOrder && (
        <div
          className="fixed inset-0 z-30 flex items-center justify-center bg-ink/60 p-4 backdrop-blur-sm"
          onClick={() => setSelectedOrderId(null)}
        >
          <div
            className="w-full max-w-md rounded-3xl bg-card p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-3xl leading-none">
                  Mesa {selectedOrder.table_number}
                </h2>
                <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                  <Clock className="size-3" />
                  {elapsedLabel(selectedOrder.created_at, now)}
                </span>
              </div>
              <button
                onClick={() => setSelectedOrderId(null)}
                aria-label="Cerrar"
                className="flex size-9 items-center justify-center rounded-full bg-secondary text-secondary-foreground"
              >
                <X className="size-4" />
              </button>
            </div>

            <ul className="mt-4 max-h-64 space-y-2 overflow-y-auto border-t border-border pt-4">
              {selectedOrder.order_items.map((item) => (
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

            <div className="mt-4 flex justify-between border-t border-border pt-3 text-sm font-semibold">
              <span>Total</span>
              <span>{currency(orderTotal(selectedOrder))}</span>
            </div>

            <div className="mt-5 flex gap-2">
              <button
                onClick={() => printTicket(selectedOrder)}
                className="flex flex-1 items-center justify-center gap-2 rounded-full bg-secondary py-3 text-sm font-semibold text-secondary-foreground active:scale-[0.99]"
              >
                <Printer className="size-4" /> Imprimir comanda
              </button>
              <button
                onClick={() => confirmClose(selectedOrder)}
                className="flex flex-1 items-center justify-center gap-2 rounded-full bg-primary py-3 text-sm font-semibold text-primary-foreground active:scale-[0.99]"
              >
                <Check className="size-4" /> Marcar servido / cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}