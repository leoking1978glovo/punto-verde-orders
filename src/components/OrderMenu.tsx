import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Leaf,
  Minus,
  Plus,
  ShoppingBag,
  Check,
  ChefHat,
  Flame,
  Sprout,
  WheatOff,
  Moon,
  Sun,
  ArrowLeft,
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

export type OrderMenuProps = {
  tableNumber: number;
  /** Texto que aparece debajo del titular (si no, el texto del cliente) */
  intro?: string;
  /** Chip extra junto al número de mesa, p. ej. "Camarero" */
  badge?: string;
  /** Muestra una flecha "atrás" en la cabecera */
  showBack?: boolean;
  onBack?: () => void;
  /** Contenido extra en la fila de enlaces del pie (opcional) */
  footerExtra?: ReactNode;
};

const currency = (value: number) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 })
    .format(value);

const CATEGORY_ORDER = ["Entradas", "Platos fuertes", "Bebidas", "Postres"];

const TAG_META: Record<string, { icon: typeof Sprout; className: string }> = {
  Vegano: { icon: Sprout, className: "bg-[#5F7A3A]/12 text-[#5F7A3A]" },
  "Sin gluten": { icon: WheatOff, className: "bg-accent/30 text-accent-foreground" },
  Picante: { icon: Flame, className: "bg-destructive/12 text-destructive" },
};

function TagChip({ tag }: { tag: string }) {
  const meta = TAG_META[tag];
  const Icon = meta?.icon ?? Leaf;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
        meta?.className ?? "bg-muted text-muted-foreground"
      }`}
    >
      <Icon className="size-3" />
      {tag}
    </span>
  );
}

export function OrderMenu({
  tableNumber,
  intro,
  badge,
  showBack,
  onBack,
  footerExtra,
}: OrderMenuProps) {
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

  useEffect(() => {
    const channel = supabase
      .channel("menu-cliente")
      .on("postgres_changes", { event: "*", schema: "public", table: "menu_items" }, () => {
        queryClient.invalidateQueries({ queryKey: ["menu"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const categories = useMemo(() => {
    const map = new Map<string, MenuItem[]>();
    for (const item of items) {
      map.set(item.category, [...(map.get(item.category) ?? []), item]);
    }
    return [...map.entries()].sort((a, b) => {
      const ia = CATEGORY_ORDER.indexOf(a[0]);
      const ib = CATEGORY_ORDER.indexOf(b[0]);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
  }, [items]);

  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  useEffect(() => {
    if (categories.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActiveCategory(visible.target.getAttribute("data-category"));
      },
      { rootMargin: "-140px 0px -60% 0px", threshold: 0 },
    );
    for (const el of Object.values(sectionRefs.current)) if (el) observer.observe(el);
    return () => observer.disconnect();
  }, [categories]);

  const scrollTo = (category: string) => {
    const el = sectionRefs.current[category];
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY - 116;
    window.scrollTo({ top, behavior: "smooth" });
  };

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
    if (cartLines.length === 0) return;
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
    <div className="min-h-screen bg-background font-sans pb-44">
      <header className="relative overflow-hidden rounded-b-[2rem] bg-deep text-primary-foreground">
        <img
          src="/hero-bg.jpg"
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full object-cover opacity-70"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-ink/70 via-ink/30 to-ink/85" />

        <div className="relative px-5 pb-10 pt-8">
          <div className="flex items-center justify-between gap-3">
            <img
              src="/punto-verde-logo.png"
              alt="Restaurante Punto Verde"
              className="size-16 rounded-full object-cover shadow-lg ring-2 ring-white/25"
            />
            <div className="flex items-center gap-2">
              {showBack && (
                <button
                  onClick={onBack}
                  aria-label="Volver"
                  className="mt-1 flex size-10 shrink-0 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur"
                >
                  <ArrowLeft className="size-5" />
                </button>
              )}
              <button
                onClick={toggle}
                aria-label={theme === "dark" ? "Activar tema claro" : "Activar tema oscuro"}
                className="mt-1 flex size-10 shrink-0 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur"
              >
                {theme === "dark" ? <Sun className="size-5" /> : <Moon className="size-5" />}
              </button>
            </div>
          </div>

          <h1 className="sr-only">Restaurante Punto Verde</h1>
          <p className="mt-6 text-xs font-semibold uppercase tracking-[0.35em] text-[#F7C137]">
            Bienvenidos · · Cocina con alma
          </p>
          <p className="mt-2 font-display text-[3.4rem] uppercase leading-[0.95] text-white">
            Tradición{" "}
            <span className="bg-[linear-gradient(90deg,#ff6b35,#f7c137)] bg-clip-text text-transparent">
              y Sabor
            </span>
          </p>

          <p className="mt-3 text-sm text-white/85">
            {intro ?? `Estás pidiendo desde la mesa ${tableNumber}.`}
          </p>
          <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-1.5 text-sm backdrop-blur">
            {badge && <span className="font-semibold text-[#F7C137]">{badge}</span>}
            Mesa <span className="font-semibold">{tableNumber}</span>
          </div>
        </div>
      </header>

      {categories.length > 0 && (
        <nav className="sticky top-0 z-10 -mt-4 border-b border-border bg-background/90 px-3 py-3 backdrop-blur">
          <ul className="flex gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none]">
            {categories.map(([category]) => (
              <li key={category}>
                <button
                  onClick={() => scrollTo(category)}
                  className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                    activeCategory === category
                      ? "bg-[#5F7A3A] text-white"
                      : "bg-white text-ink border border-ink/20"
                  }`}
                >
                  {category}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      )}

      <main className="px-5">
        {isLoading && <p className="py-10 text-center text-muted-foreground">Cargando menú…</p>}

        {categories.map(([category, list]) => (
          <section
            key={category}
            data-category={category}
            ref={(el) => {
              sectionRefs.current[category] = el;
            }}
            className="mt-8 scroll-mt-32"
          >
            <h2 className="font-display text-2xl text-foreground">{category}</h2>
            <div className="mt-1 h-px w-16 bg-clay" />
            <ul className="mt-4 space-y-4">
              {list.map((item) => (
                <li
                  key={item.id}
                  className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm"
                >
                  {item.image_url ? (
                    <img
                      src={item.image_url}
                      alt={item.name}
                      loading="lazy"
                      width={768}
                      height={576}
                      className="h-44 w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-24 w-full items-center justify-center bg-secondary text-secondary-foreground">
                      <Leaf className="size-6" />
                    </div>
                  )}
                  <div className="flex items-start justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <h3 className="font-semibold text-card-foreground">{item.name}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
                      {item.tags?.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {item.tags.map((tag) => (
                            <TagChip key={tag} tag={tag} />
                          ))}
                        </div>
                      )}
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

        <div className="mt-10 flex flex-wrap justify-center gap-6">
          <Link
            to="/cocina"
            className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground"
          >
            <ChefHat className="size-4" /> Vista de cocina
          </Link>
          <Link to="/admin" className="text-xs uppercase tracking-widest text-muted-foreground">
            Administración
          </Link>
          {footerExtra}
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