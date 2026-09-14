import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BookOpen,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
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
  added_at: string | null;
};

type ActiveOrder = {
  id: string;
  table_number: number;
  created_at: string;
  items_updated_at: string | null;
  kitchen_seen_at: string | null;
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

function hasNews(order: ActiveOrder) {
  // Burbuja si: la cocina NO lo ha visto nunca (pedido nuevo)
  // o si se añadieron platos después de la última vez que lo vio
  return (
    !order.kitchen_seen_at ||
    (!!order.items_updated_at && order.items_updated_at > order.kitchen_seen_at)
  );
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
  const [viewNews, setViewNews] = useState<{ id: string; threshold: string } | null>(null);
  const [menuCart, setMenuCart] = useState<Record<string, number>>({});
  const [openCategory, setOpenCategory] = useState<string | null>(null);
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

  const { data: quickCats = [] } = useQuery({
    queryKey: ["quick-categories"],
    queryFn: async (): Promise<{ name: string; sort_order: number }[]> => {
      const { data, error } = await supabase
        .from("menu_categories")
        .select("name, sort_order")
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["active-orders"],
    queryFn: async (): Promise<ActiveOrder[]> => {
      const { data, error } = await supabase
        .from("orders")
        .select(
          "id, table_number, created_at, items_updated_at, kitchen_seen_at, order_items(id, name, quantity, unit_price, added_at)"
        )
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
      .on("postgres_changes", { event: "*", schema: "public", table: "menu_categories" }, () => {
        queryClient.invalidateQueries({ queryKey: ["quick-categories"] });
        queryClient.invalidateQueries({ queryKey: ["quick-menu"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  // Respaldo: aunque el tiempo real falle (pestaña en segundo plano, PC suspendido),
  // los contadores y tarjetas se actualizan solos cada 10 s y al volver a la pestaña.
  useEffect(() => {
    const refresh = () => {
      queryClient.invalidateQueries({ queryKey: ["active-orders"] });
      queryClient.invalidateQueries({ queryKey: ["tables"] });
    };
    const interval = setInterval(refresh, 10000);
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", refresh);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", refresh);
    };
  }, [queryClient]);

  const orderByTable = useMemo(() => {
    const map = new Map<number, ActiveOrder>();
    for (const o of orders) map.set(o.table_number, o);
    return map;
  }, [orders]);

  // Cola de cocina: el primero que pidió va el primero
  const queue = useMemo(
    () => [...orders].sort((a, b) => a.created_at.localeCompare(b.created_at)),
    [orders],
  );

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
    const rank = new Map(quickCats.map((x, i) => [x.name, i]));
    return [...map.entries()].sort((a, b) => {
      const ia = rank.get(a[0]);
      const ib = rank.get(b[0]);
      return (ia ?? 999) - (ib ?? 999);
    });
  }, [menuItems, quickCats]);

  const freeCount = Math.max(0, tables.length - orders.length);

  const selectedOrder = useMemo(
    () => orders.find((o) => o.id === selectedOrderId) ?? null,
    [orders, selectedOrderId]
  );

  useEffect(() => {
    if (selectedOrderId && !selectedOrder) setSelectedOrderId(null);
  }, [selectedOrderId, selectedOrder]);

  async function openOrder(order: ActiveOrder) {
    // Umbral de "Nuevo": todo lo añadido desde la última vez que cocina lo vio
    // (en un pedido NUNCA visto, el umbral es su creación → TODOS los platos salen como Nuevo)
    setViewNews({
      id: order.id,
      threshold: order.kitchen_seen_at ?? order.created_at,
    });
    // Marcar como visto siempre (quita la burbuja)
    await supabase
      .from("orders")
      .update({ kitchen_seen_at: new Date().toISOString() })
      .eq("id", order.id);
    queryClient.invalidateQueries({ queryKey: ["active-orders"] });
    setSelectedOrderId(order.id);
  }

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

  const effectiveOpen = openCategory === null ? (quickGroups[0]?.[0] ?? "") : openCategory;

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

      const wasExisting = !!existing?.id;
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
      queryClient.invalidateQueries({ queryKey: ["active-orders"] });
      setMenuCart({});
      setMenuTable(null);
    } finally {
      setQuickSending(false);
    }
  }

  const isNewItem = (orderId: string, item: OrderItem) =>
    viewNews?.id === orderId && !!item.added_at && item.added_at >= viewNews.threshold;

  const renderCompactCard = (order: ActiveOrder) => {
    const active = selectedOrderId === order.id;
    return (
      <button
        key={order.id}
        onClick={() => openOrder(order)}
        title={`Mesa ${order.table_number} — ver pedido`}
        className={`relative flex aspect-square items-center justify-center rounded-xl font-display text-2xl transition-colors ${
          active
            ? "border-2 border-primary bg-primary text-primary-foreground"
            : "border-2 border-primary bg-card text-card-foreground hover:bg-primary/10"
        }`}
      >
        {hasNews(order) && (
          <span
            aria-label="Pedido nuevo o actualizado"
            className="absolute -right-1 -top-1 z-10 flex size-4 animate-pulse items-center justify-center rounded-full bg-destructive text-[9px] font-bold text-white ring-2 ring-background"
          >
            !
          </span>
        )}
        {order.table_number}
      </button>
    );
  };
  return (
    <div className="min-h-screen bg-background font-sans pb-12">
      {/* Barra superior compacta y fija: siempre visible, sin foto */}
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
        <div className="flex items-center justify-between gap-2">
          <h1 className="font-display text-2xl uppercase leading-none text-foreground">
            Cocina
          </h1>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">
              {orders.length} pedido(s) activo(s)
            </span>
            <span className="hidden rounded-full bg-muted px-3 py-1 text-sm text-muted-foreground sm:inline">
              {freeCount} mesas libres
            </span>
            <Link
              to="/admin"
              aria-label="Gestionar mesas"
              className="flex size-9 items-center justify-center rounded-full bg-muted text-foreground"
            >
              <Settings2 className="size-4" />
            </Link>
          </div>
        </div>
      </header>

      <main className="px-3">
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

        {/* Cola de pedidos: por orden de llegada */}
        {queue.length > 0 && (
          <div className="mt-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Cola · por orden de llegada
            </p>
            <ul className="mt-2 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
              {queue.map((o, i) => (
                <li
                  key={o.id}
                  className="flex shrink-0 items-center gap-2 rounded-full border border-primary bg-card px-3 py-1.5 text-sm text-card-foreground"
                >
                  <span className="flex size-5 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
                    {i + 1}
                  </span>
                  Mesa {o.table_number}
                  <span className="text-xs text-muted-foreground">
                    {elapsedLabel(o.created_at, now)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {tables.length > 0 && (
          <div className="mt-4 lg:mt-0 lg:flex">
            {/* Lista compacta de mesas (izquierda) */}
            <aside className="grid grid-cols-4 gap-2 p-4 sm:grid-cols-6 lg:sticky lg:top-14 lg:grid-cols-4 lg:gap-2.5 lg:p-3 lg:max-h-[calc(100vh-3.5rem)] lg:w-80 lg:shrink-0 lg:overflow-y-auto lg:border-r lg:border-border">
              {tables.map((table) => {
                const order = orderByTable.get(table.table_number);
                if (order) return renderCompactCard(order);
                return (
                  <button
                    key={table.id}
                    onClick={() => setMenuTable(table.table_number)}
                    title={`Mesa ${table.table_number} libre — abrir menú`}
                    className="flex aspect-square items-center justify-center rounded-xl border border-dashed border-border bg-muted font-display text-2xl text-muted-foreground transition-colors hover:bg-muted/70"
                  >
                    {table.table_number}
                  </button>
                );
              })}
              {orphanOrders.map((order) => renderCompactCard(order))}
            </aside>

            {/* Detalle del pedido (derecha, solo escritorio) */}
            <section className="mt-4 hidden min-w-0 flex-1 lg:mt-0 lg:block lg:p-5">
              {selectedOrder ? (
                <div className="max-w-2xl">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="font-display text-4xl leading-none">
                        Mesa {selectedOrder.table_number}
                      </h2>
                      <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                        <Clock className="size-3" />
                        {elapsedLabel(selectedOrder.created_at, now)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setMenuTable(selectedOrder.table_number)}
                        className="flex items-center gap-1.5 rounded-full bg-secondary px-4 py-2 text-sm font-semibold text-secondary-foreground active:scale-[0.99]"
                      >
                        <BookOpen className="size-4" /> Menú
                      </button>
                      <button
                        onClick={() => printTicket(selectedOrder)}
                        className="flex items-center gap-1.5 rounded-full bg-secondary px-4 py-2 text-sm font-semibold text-secondary-foreground active:scale-[0.99]"
                      >
                        <Printer className="size-4" /> Imprimir
                      </button>
                    </div>
                  </div>

                  <ul className="mt-5 space-y-2 border-t border-border pt-4">
                    {selectedOrder.order_items.map((item) => {
                      const isNew = isNewItem(selectedOrder.id, item);
                      return (
                        <li
                          key={item.id}
                          className={`flex justify-between gap-2 rounded-lg px-2 py-2 text-sm ${
                            isNew ? "bg-primary/15" : ""
                          }`}
                        >
                          <span className="text-card-foreground">
                            <span className="mr-2 inline-flex min-w-6 justify-center rounded-md bg-accent px-1.5 font-semibold text-accent-foreground">
                              {item.quantity}
                            </span>
                            {item.name}
                            {isNew && (
                              <span className="ml-2 rounded-full bg-primary px-2 py-0.5 align-middle text-[10px] font-bold text-primary-foreground">
                                Nuevo
                              </span>
                            )}
                          </span>
                          <span className="text-muted-foreground">
                            {currency(Number(item.unit_price) * item.quantity)}
                          </span>
                        </li>
                      );
                    })}
                  </ul>

                  <div className="mt-4 flex justify-between border-t border-border pt-3 text-sm font-semibold">
                    <span>Total</span>
                    <span>{currency(orderTotal(selectedOrder))}</span>
                  </div>

                  <button
                    onClick={() => confirmClose(selectedOrder)}
                    className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3 text-sm font-semibold text-primary-foreground active:scale-[0.99]"
                  >
                    <Check className="size-4" /> Marcar servido / cerrar
                  </button>
                </div>
              ) : (
                <div className="flex h-64 items-center justify-center text-sm text-muted-foreground lg:h-[50vh]">
                  Selecciona una mesa de la lista para ver su pedido completo
                </div>
              )}
            </section>
          </div>
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
                  <button
                    type="button"
                    onClick={() =>
                      setOpenCategory(category === effectiveOpen ? "__none__" : category)
                    }
                    className="mb-1.5 mt-2 flex w-full items-center justify-between rounded-lg bg-secondary px-2.5 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-secondary-foreground first:mt-0"
                  >
                    {category}
                    {category === effectiveOpen ? (
                      <ChevronUp className="size-3.5" />
                    ) : (
                      <ChevronDown className="size-3.5" />
                    )}
                  </button>
                  {category === effectiveOpen && (
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
                  )}
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
          className="fixed inset-0 z-30 flex items-center justify-center bg-ink/60 p-4 backdrop-blur-sm lg:hidden"
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
              {selectedOrder.order_items.map((item) => {
                const isNew =
                  viewNews?.id === selectedOrder.id &&
                  !!item.added_at &&
                  item.added_at >= viewNews.threshold;
                return (
                  <li
                    key={item.id}
                    className={`flex justify-between gap-2 rounded-lg px-2 py-1.5 text-sm ${
                      isNew ? "bg-primary/15" : ""
                    }`}
                  >
                    <span className="text-card-foreground">
                      <span className="mr-2 inline-flex min-w-6 justify-center rounded-md bg-accent px-1.5 font-semibold text-accent-foreground">
                        {item.quantity}
                      </span>
                      {item.name}
                      {isNew && (
                        <span className="ml-2 rounded-full bg-primary px-2 py-0.5 align-middle text-[10px] font-bold text-primary-foreground">
                          Nuevo
                        </span>
                      )}
                    </span>
                    <span className="text-muted-foreground">
                      {currency(Number(item.unit_price) * item.quantity)}
                    </span>
                  </li>
                );
              })}
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