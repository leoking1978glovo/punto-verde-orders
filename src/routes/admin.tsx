import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Lock, LogOut, Plus, Pencil, Trash2, EyeOff, Eye, X, ReceiptText } from "lucide-react";
import {
  adminStatus,
  adminLogin,
  adminLogout,
  adminListItems,
  adminSaveItem,
  adminDeleteItem,
  adminToggleAvailable,
  type AdminMenuItem,
} from "@/lib/admin.functions";
import { AdminTables } from "@/components/AdminTables";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Administración | Restaurante Punto Verde" },
      {
        name: "description",
        content:
          "Panel privado para gestionar los productos, fotos, precios y disponibilidad del menú de Restaurante Punto Verde.",
      },
      { property: "og:title", content: "Administración | Restaurante Punto Verde" },
      { property: "og:description", content: "Gestiona el menú del restaurante." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminPage,
  errorComponent: ({ error }) => (
    <div role="alert" className="p-8 text-center text-sm text-muted-foreground">
      Error: {error.message}
    </div>
  ),
  notFoundComponent: () => <div className="p-8 text-center">No disponible.</div>,
});

const CATEGORIES = ["Entradas", "Platos fuertes", "Bebidas", "Postres"];
const TAGS = ["Vegano", "Sin gluten", "Picante"];

const currency = (value: number) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 })
    .format(value);

type Draft = {
  id?: string;
  name: string;
  description: string;
  price: string;
  category: string;
  image_url: string;
  sort_order: string;
  tags: string[];
  available: boolean;
};

const emptyDraft = (): Draft => ({
  name: "",
  description: "",
  price: "",
  category: CATEGORIES[0] as string,
  image_url: "",
  sort_order: "1",
  tags: [],
  available: true,
});

function AdminPage() {
  const status = useServerFn(adminStatus);
  const login = useServerFn(adminLogin);
  const logout = useServerFn(adminLogout);

  const [unlocked, setUnlocked] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState(false);
  const [loginMessage, setLoginMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    status({})
      .then((r) => {
        if (!cancelled) setUnlocked(r.unlocked === true);
      })
      .catch((err) => {
        console.error("admin status", err);
        if (!cancelled) setUnlocked(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onLogin(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setLoginError(false);
    setLoginMessage("");
    try {
      const { ok } = await login({ data: { password } });
      if (ok) setUnlocked(true);
      else setLoginError(true);
    } catch (err) {
      setLoginError(true);
      setLoginMessage(err instanceof Error ? err.message : "Error al entrar");
    } finally {
      setBusy(false);
      setPassword("");
    }
  }

  if (unlocked === null) {
    return <p className="p-10 text-center text-muted-foreground">Cargando…</p>;
  }

  if (!unlocked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6 font-sans">
        <form onSubmit={onLogin} className="w-full max-w-sm rounded-3xl bg-card p-7 shadow-sm">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Lock className="size-6" />
          </div>
          <h1 className="mt-4 text-center font-display text-2xl">Administración</h1>
          <p className="mt-1 text-center text-sm text-muted-foreground">
            Ingresa la contraseña del restaurante.
          </p>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            placeholder="Contraseña"
            className="mt-5 w-full rounded-2xl border border-input bg-background px-4 py-3 text-foreground"
          />
          {loginError && (
            <p className="mt-2 text-sm text-destructive">Contraseña incorrecta.</p>
          )}
          {loginMessage && (
            <p className="mt-2 text-sm text-destructive">{loginMessage}</p>
          )}
          <button
            disabled={busy}
            className="mt-4 w-full rounded-full bg-primary py-3 font-semibold text-primary-foreground disabled:opacity-50"
          >
            {busy ? "Entrando…" : "Entrar"}
          </button>
          <Link
            to="/"
            className="mt-4 block text-center text-xs uppercase tracking-widest text-muted-foreground"
          >
            Volver al menú
          </Link>
        </form>
      </div>
    );
  }

  return (
    <AdminDashboard
      onLogout={async () => {
        await logout({});
        setUnlocked(false);
      }}
    />
  );
}

function AdminDashboard({ onLogout }: { onLogout: () => void }) {
  const queryClient = useQueryClient();
  const list = useServerFn(adminListItems);
  const save = useServerFn(adminSaveItem);
  const remove = useServerFn(adminDeleteItem);
  const toggle = useServerFn(adminToggleAvailable);

  const { data: items = [], isLoading, error: listError } = useQuery({
    queryKey: ["admin-menu"],
    queryFn: () => list({}) as Promise<AdminMenuItem[]>,
  });

  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["admin-menu"] });

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      await save({
        data: {
          ...(draft.id ? { id: draft.id } : {}),
          name: draft.name,
          description: draft.description,
          price: Number(draft.price),
          category: draft.category,
          image_url: draft.image_url,
          sort_order: Number(draft.sort_order) || 0,
          tags: draft.tags,
          available: draft.available,
        },
      });
      setDraft(null);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos guardar el producto.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-background font-sans pb-24">
      <header className="relative overflow-hidden rounded-b-[2rem] bg-deep text-primary-foreground">
        <img
          src="/hero-bg.jpg"
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full object-cover opacity-60"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-ink/70 via-ink/30 to-ink/85" />

        <div className="relative px-5 pb-8 pt-8">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <img
                src="/punto-verde-logo.png"
                alt="Restaurante Punto Verde"
                className="size-14 rounded-full object-cover shadow-lg ring-2 ring-white/25"
              />
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[#F7C137]">
                  Panel privado
                </p>
                <h1 className="mt-1 font-display text-3xl uppercase leading-none text-white">
                  Menú
                </h1>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Link
                to="/tickets"
                aria-label="Tickets y cierre de caja"
                className="flex size-10 items-center justify-center rounded-full bg-white/15 backdrop-blur"
              >
                <ReceiptText className="size-5" />
              </Link>
              <button
                onClick={onLogout}
                aria-label="Cerrar sesión"
                className="flex size-10 items-center justify-center rounded-full bg-white/15 backdrop-blur"
              >
                <LogOut className="size-5" />
              </button>
            </div>
          </div>
          <p className="mt-4 text-sm text-white/85">{items.length} producto(s)</p>
        </div>
      </header>

      <main className="px-5">
        <button
          onClick={() => setDraft(emptyDraft())}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3.5 font-semibold text-primary-foreground"
        >
          <Plus className="size-5" /> Nuevo producto
        </button>

        <AdminTables />

        {isLoading && <p className="py-10 text-center text-muted-foreground">Cargando…</p>}

        {listError && (
          <p className="mt-4 rounded-2xl bg-destructive/10 p-4 text-sm text-destructive">
            Error cargando productos: {listError instanceof Error ? listError.message : "desconocido"}
          </p>
        )}

        <ul className="mt-5 space-y-3">
          {items.map((item) => (
            <li
              key={item.id}
              className={`rounded-2xl border border-border bg-card p-4 ${
                item.available ? "" : "opacity-60"
              }`}
            >
              <div className="flex gap-3">
                {item.image_url && (
                  <img
                    src={item.image_url}
                    alt={item.name}
                    loading="lazy"
                    width={768}
                    height={576}
                    className="size-16 shrink-0 rounded-xl object-cover"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    {item.category}
                  </p>
                  <h2 className="font-semibold text-card-foreground">{item.name}</h2>
                  <p className="text-sm text-muted-foreground">{currency(item.price)}</p>
                  {!item.available && (
                    <span className="mt-1 inline-block rounded-full bg-destructive/12 px-2 py-0.5 text-[11px] font-medium text-destructive">
                      Agotado
                    </span>
                  )}
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={async () => {
                    await toggle({ data: { id: item.id, available: !item.available } });
                    refresh();
                  }}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-secondary py-2 text-sm font-medium text-secondary-foreground"
                >
                  {item.available ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  {item.available ? "Agotado" : "Disponible"}
                </button>
                <button
                  onClick={() =>
                    setDraft({
                      id: item.id,
                      name: item.name,
                      description: item.description,
                      price: String(item.price),
                      category: item.category,
                      image_url: item.image_url,
                      sort_order: String(item.sort_order),
                      tags: item.tags ?? [],
                      available: item.available,
                    })
                  }
                  aria-label={`Editar ${item.name}`}
                  className="flex size-10 items-center justify-center rounded-full bg-secondary text-secondary-foreground"
                >
                  <Pencil className="size-4" />
                </button>
                <button
                  onClick={async () => {
                    if (!window.confirm(`¿Eliminar "${item.name}" del menú?`)) return;
                    await remove({ data: { id: item.id } });
                    refresh();
                  }}
                  aria-label={`Eliminar ${item.name}`}
                  className="flex size-10 items-center justify-center rounded-full bg-destructive/12 text-destructive"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>

        <div className="mt-10 text-center">
          <Link to="/" className="text-xs uppercase tracking-widest text-muted-foreground">
            Ver el menú del cliente
          </Link>
        </div>
      </main>

      {draft && (
        <div className="fixed inset-0 z-30 overflow-y-auto bg-foreground/40 p-4">
          <form
            onSubmit={onSave}
            className="mx-auto mt-6 w-full max-w-md rounded-3xl bg-card p-6 shadow-lg"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-display text-2xl">
                {draft.id ? "Editar producto" : "Nuevo producto"}
              </h2>
              <button
                type="button"
                onClick={() => setDraft(null)}
                aria-label="Cerrar"
                className="flex size-9 items-center justify-center rounded-full bg-secondary text-secondary-foreground"
              >
                <X className="size-4" />
              </button>
            </div>

            <label className="mt-4 block text-sm font-medium">
              Nombre
              <input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                required
                className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2.5 font-normal"
              />
            </label>

            <label className="mt-3 block text-sm font-medium">
              Descripción corta
              <textarea
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                rows={2}
                className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2.5 font-normal"
              />
            </label>

            <div className="mt-3 grid grid-cols-2 gap-3">
              <label className="block text-sm font-medium">
                Precio (COP)
                <input
                  type="number"
                  min="0"
                  step="500"
                  value={draft.price}
                  onChange={(e) => setDraft({ ...draft, price: e.target.value })}
                  required
                  className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2.5 font-normal"
                />
              </label>
              <label className="block text-sm font-medium">
                Orden
                <input
                  type="number"
                  min="0"
                  value={draft.sort_order}
                  onChange={(e) => setDraft({ ...draft, sort_order: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2.5 font-normal"
                />
              </label>
            </div>

            <label className="mt-3 block text-sm font-medium">
              Categoría
              <select
                value={draft.category}
                onChange={(e) => setDraft({ ...draft, category: e.target.value })}
                className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2.5 font-normal"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>

            <label className="mt-3 block text-sm font-medium">
              Foto (enlace)
              <input
                value={draft.image_url}
                onChange={(e) => setDraft({ ...draft, image_url: e.target.value })}
                placeholder="https://… o /menu/foto.jpg"
                className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2.5 font-normal"
              />
            </label>
            {draft.image_url && (
              <img
                src={draft.image_url}
                alt="Vista previa"
                loading="lazy"
                className="mt-2 h-32 w-full rounded-xl object-cover"
              />
            )}

            <fieldset className="mt-4">
              <legend className="text-sm font-medium">Etiquetas</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {TAGS.map((tag) => {
                  const on = draft.tags.includes(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() =>
                        setDraft({
                          ...draft,
                          tags: on ? draft.tags.filter((t) => t !== tag) : [...draft.tags, tag],
                        })
                      }
                      className={`rounded-full px-3 py-1.5 text-sm ${
                        on
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary text-secondary-foreground"
                      }`}
                    >
                      {tag}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <label className="mt-4 flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={!draft.available}
                onChange={(e) => setDraft({ ...draft, available: !e.target.checked })}
                className="size-4"
              />
              Marcar como agotado (se oculta del menú)
            </label>

            {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

            <button
              disabled={saving}
              className="mt-5 w-full rounded-full bg-primary py-3 font-semibold text-primary-foreground disabled:opacity-50"
            >
              {saving ? "Guardando…" : "Guardar"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}