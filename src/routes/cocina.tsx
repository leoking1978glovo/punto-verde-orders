import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChefHat, Clock, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type ActiveOrder = {
  id: string;
  table_number: number;
  created_at: string;
  order_items: { id: string; name: string; quantity: number; unit_price: number }[];
};

export const Route = createFileRoute("/cocina")({
  head: () => ({
    meta: [
      { title: "Cocina | Restaurante Punto Verde" },
      {
        name: "description",
        content:
          "Panel de cocina en tiempo real con los pedidos activos por mesa de Restaurante Punto Verde.",
      },
      { property: "og:title", content: "Cocina | Restaurante Punto Verde" },
      {
        property: "og:description",
        content: "Pedidos activos por mesa, en tiempo real.",
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

function KitchenPage() {
  const queryClient = useQueryClient();

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
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  async function closeOrder(id: string) {
    await supabase.from("orders").update({ status: "servido" }).eq("id", id);
    queryClient.invalidateQueries({ queryKey: ["active-orders"] });
  }

  return (
    <div className="min-h-screen bg-background font-sans pb-12">
      <header className="bg-deep px-5 pb-7 pt-10 text-primary-foreground rounded-b-[2rem]">
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-primary-foreground/70">
          <ChefHat className="size-4" /> Tiempo real
        </div>
        <h1 className="mt-3 font-display text-3xl leading-tight">
          Cocina - Restaurante Punto Verde
        </h1>
        <p className="mt-2 text-sm text-primary-foreground/80">
          {orders.length} pedido(s) activo(s)
        </p>
      </header>

      <main className="px-5">
        {isLoading && <p className="py-10 text-center text-muted-foreground">Cargando pedidos…</p>}

        {!isLoading && orders.length === 0 && (
          <div className="mt-10 rounded-3xl border border-dashed border-clay/60 bg-sand p-8 text-center">
            <p className="font-display text-xl">Todo al día</p>
            <p className="mt-1 text-sm text-muted-foreground">
              No hay pedidos activos en este momento.
            </p>
          </div>
        )}

        <ul className="mt-6 space-y-4">
          {orders.map((order) => {
            const total = order.order_items.reduce(
              (sum, i) => sum + Number(i.unit_price) * i.quantity,
              0,
            );
            return (
              <li key={order.id} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <h2 className="font-display text-2xl">Mesa {order.table_number}</h2>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="size-3.5" />
                    {new Date(order.created_at).toLocaleTimeString("es-CO", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                <ul className="mt-3 space-y-1.5">
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
                <div className="mt-3 flex justify-between border-t border-border pt-3 text-sm font-semibold">
                  <span>Total</span>
                  <span>{currency(total)}</span>
                </div>
                <button
                  onClick={() => closeOrder(order.id)}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3 font-semibold text-primary-foreground active:scale-[0.99]"
                >
                  <Check className="size-5" /> Marcar servido / cerrar
                </button>
              </li>
            );
          })}
        </ul>

        <div className="mt-10 text-center">
          <Link to="/" className="text-xs uppercase tracking-widest text-muted-foreground">
            Ir al menú del cliente
          </Link>
        </div>
      </main>
    </div>
  );
}
