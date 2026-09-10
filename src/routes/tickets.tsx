import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { jsPDF } from "jspdf";
import { ArrowLeft, Download, Lock, ReceiptText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { adminStatus } from "@/lib/admin.functions";

export const Route = createFileRoute("/tickets")({
  head: () => ({
    meta: [{ title: "Tickets | Restaurante Punto Verde" }, { name: "robots", content: "noindex" }],
  }),
  component: TicketsPage,
});

const currency = (value: number) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value);

type OrderRow = {
  id: string;
  table_number: number;
  created_at: string;
  status: string;
};

type ItemRow = {
  id: string;
  order_id: string;
  name: string;
  unit_price: number;
  quantity: number;
};

function todayLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function downloadTicketPdf(order: OrderRow, items: ItemRow[]) {
  const total = items.reduce((s, i) => s + Number(i.unit_price) * i.quantity, 0);
  const doc = new jsPDF({ unit: "mm", format: [80, 140] });

  let y = 12;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("Restaurante Punto Verde", 40, y, { align: "center" });
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("Cocina fresca y natural", 40, y, { align: "center" });
  y += 6;
  doc.line(6, y, 74, y);
  y += 6;

  doc.setFontSize(10);
  doc.text(`Mesa: ${order.table_number}`, 6, y);
  doc.text(
    new Date(order.created_at).toLocaleString("es-CO", {
      dateStyle: "short",
      timeStyle: "short",
    }),
    74,
    y,
    { align: "right" }
  );
  y += 7;

  doc.setFontSize(9);
  items.forEach((item) => {
    const line = `${item.quantity} x ${item.name}`;
    doc.text(line.substring(0, 32), 6, y);
    doc.text(currency(Number(item.unit_price) * item.quantity), 74, y, { align: "right" });
    y += 5;
  });

  y += 2;
  doc.line(6, y, 74, y);
  y += 6;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("TOTAL", 6, y);
  doc.text(currency(total), 74, y, { align: "right" });
  y += 8;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text("Gracias por su visita", 40, y, { align: "center" });

  doc.save(`ticket-mesa${order.table_number}-${order.id.slice(0, 8)}.pdf`);
}

function TicketsPage() {
  const status = useServerFn(adminStatus);
  const [unlocked, setUnlocked] = useState<boolean | null>(null);
  const [date, setDate] = useState(todayLocal());

  useEffect(() => {
    let cancelled = false;
    status({})
      .then((r) => {
        if (!cancelled) setUnlocked(r.unlocked === true);
      })
      .catch(() => {
        if (!cancelled) setUnlocked(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data: orders = [] } = useQuery({
    queryKey: ["tickets", date],
    queryFn: async (): Promise<OrderRow[]> => {
      const start = new Date(`${date}T00:00:00`);
      const end = new Date(`${date}T23:59:59.999`);
      const { data, error } = await supabase
        .from("orders")
        .select("id, table_number, created_at, status")
        .eq("status", "servido")
        .gte("created_at", start.toISOString())
        .lte("created_at", end.toISOString())
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as OrderRow[];
    },
    enabled: unlocked === true,
  });

  const orderIds = useMemo(() => orders.map((o) => o.id), [orders]);

  const { data: items = [] } = useQuery({
    queryKey: ["ticket-items", date, orderIds.join(",")],
    queryFn: async (): Promise<ItemRow[]> => {
      if (orderIds.length === 0) return [];
      const { data, error } = await supabase
        .from("order_items")
        .select("id, order_id, name, unit_price, quantity")
        .in("order_id", orderIds);
      if (error) throw error;
      return (data ?? []) as ItemRow[];
    },
    enabled: unlocked === true && orderIds.length > 0,
  });

  const itemsByOrder = useMemo(() => {
    const map = new Map<string, ItemRow[]>();
    for (const item of items) {
      map.set(item.order_id, [...(map.get(item.order_id) ?? []), item]);
    }
    return map;
  }, [items]);

  const totalDia = useMemo(
    () =>
      orders.reduce(
        (sum, o) =>
          sum +
          (itemsByOrder.get(o.id) ?? []).reduce(
            (s, i) => s + Number(i.unit_price) * i.quantity,
            0
          ),
        0
      ),
    [orders, itemsByOrder]
  );

  if (unlocked === null) {
    return <p className="p-10 text-center text-muted-foreground">Cargando…</p>;
  }

  if (!unlocked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6 font-sans">
        <div className="w-full max-w-sm rounded-3xl bg-card p-7 text-center shadow-sm">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Lock className="size-6" />
          </div>
          <h1 className="mt-4 font-display text-2xl">Acceso restringido</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Debes entrar como administrador para ver los tickets.
          </p>
          <Link
            to="/admin"
            className="mt-5 block rounded-full bg-primary py-3 font-semibold text-primary-foreground"
          >
            Ir a Administración
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background font-sans pb-16">
      <header className="bg-deep px-5 pb-7 pt-9 text-primary-foreground rounded-b-[2rem]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-primary-foreground/70">
              Cierre de caja
            </p>
            <h1 className="mt-2 font-display text-3xl">Tickets del día</h1>
          </div>
          <Link
            to="/admin"
            aria-label="Volver al panel"
            className="mt-1 flex size-10 items-center justify-center rounded-full bg-primary-foreground/15"
          >
            <ArrowLeft className="size-5" />
          </Link>
        </div>

        <label className="mt-5 block text-sm text-primary-foreground/80">
          Fecha
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="mt-1 w-full rounded-xl border-0 bg-primary-foreground/15 px-3 py-2.5 text-primary-foreground [color-scheme:dark]"
          />
        </label>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-primary-foreground/15 p-4">
            <p className="text-xs uppercase tracking-wide text-primary-foreground/70">Tickets</p>
            <p className="mt-1 font-display text-2xl">{orders.length}</p>
          </div>
          <div className="rounded-2xl bg-primary-foreground/15 p-4">
            <p className="text-xs uppercase tracking-wide text-primary-foreground/70">
              Total vendido
            </p>
            <p className="mt-1 font-display text-2xl">{currency(totalDia)}</p>
          </div>
        </div>
      </header>

      <main className="px-5">
        {orders.length === 0 && (
          <p className="py-10 text-center text-muted-foreground">
            No hay tickets cerrados en esta fecha.
          </p>
        )}

        <ul className="mt-5 space-y-3">
          {orders.map((order) => {
            const orderItems = itemsByOrder.get(order.id) ?? [];
            const total = orderItems.reduce(
              (s, i) => s + Number(i.unit_price) * i.quantity,
              0
            );
            return (
              <li key={order.id} className="rounded-2xl border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-card-foreground">
                      Mesa {order.table_number}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {new Date(order.created_at).toLocaleString("es-CO", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </p>
                  </div>
                  <p className="font-display text-xl text-primary">{currency(total)}</p>
                </div>

                <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                  {orderItems.map((item) => (
                    <li key={item.id} className="flex justify-between">
                      <span>
                        {item.quantity} × {item.name}
                      </span>
                      <span>{currency(Number(item.unit_price) * item.quantity)}</span>
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => downloadTicketPdf(order, orderItems)}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-primary py-2.5 text-sm font-semibold text-primary-foreground"
                >
                  <Download className="size-4" /> Descargar ticket (PDF)
                </button>
              </li>
            );
          })}
        </ul>

        <div className="mt-8 flex justify-center">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground"
          >
            <ReceiptText className="size-4" /> Ver menú del cliente
          </Link>
        </div>
      </main>
    </div>
  );
}