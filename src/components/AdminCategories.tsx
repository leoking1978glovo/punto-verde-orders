import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowDown, ArrowUp, Pencil, Plus, Tags, Trash2 } from "lucide-react";
import {
  adminListCategories,
  adminSaveCategory,
  adminDeleteCategory,
  adminReorderCategories,
  type AdminCategory,
} from "@/lib/admin.functions";

// ─────────────────────────────────────────────────────────────
// Sección "Categorías" del panel de administración.
// Insertar dentro de AdminDashboard, justo después de
// <AdminTables /> (ver instrucciones del chat).
// ─────────────────────────────────────────────────────────────

const iconBtn =
  "flex size-9 items-center justify-center rounded-full bg-secondary text-secondary-foreground disabled:opacity-40";

export function AdminCategories() {
  const queryClient = useQueryClient();
  const list = useServerFn(adminListCategories);
  const save = useServerFn(adminSaveCategory);
  const remove = useServerFn(adminDeleteCategory);
  const reorder = useServerFn(adminReorderCategories);

  const { data: categories = [], isLoading } = useQuery({
    queryKey: ["admin-categories"],
    queryFn: () => list({}) as Promise<AdminCategory[]>,
  });

  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["admin-categories"] });

  async function onAdd(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    setError(null);
    try {
      await save({ data: { name, sort_order: categories.length + 1 } });
      setNewName("");
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar la categoría.");
    } finally {
      setBusy(false);
    }
  }

  async function onRename(cat: AdminCategory) {
    const name = window.prompt("Nuevo nombre de la categoría:", cat.name);
    if (!name || name.trim() === cat.name) return;
    try {
      await save({ data: { id: cat.id, name: name.trim() } });
      refresh();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "No se pudo renombrar.");
    }
  }

  async function onMove(cat: AdminCategory, dir: -1 | 1) {
    const idx = categories.findIndex((c) => c.id === cat.id);
    const target = idx + dir;
    if (idx < 0 || target < 0 || target >= categories.length) return;
    const next = [...categories];
    [next[idx], next[target]] = [next[target], next[idx]];
    await reorder({
      data: { items: next.map((c, i) => ({ id: c.id, sort_order: i + 1 })) },
    });
    refresh();
  }

  async function onDelete(cat: AdminCategory) {
    if (!window.confirm(`¿Eliminar la categoría "${cat.name}"?`)) return;
    try {
      await remove({ data: { id: cat.id } });
      refresh();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "No se pudo eliminar.");
    }
  }

  return (
    <section className="mt-8">
      <h2 className="font-display text-2xl">Categorías</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Ordenan el menú del cliente y las ventanas de cocina. Renombrar mueve los productos
        automáticamente.
      </p>

      <form onSubmit={onAdd} className="mt-4 flex gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Nueva categoría (p. ej. Desayunos)"
          className="min-w-0 flex-1 rounded-xl border border-input bg-background px-3 py-2.5 text-sm"
        />
        <button
          type="submit"
          disabled={busy || !newName.trim()}
          className="flex shrink-0 items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          <Plus className="size-4" /> Añadir
        </button>
      </form>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}

      {isLoading && <p className="py-6 text-center text-muted-foreground">Cargando…</p>}

      <ul className="mt-4 space-y-2">
        {categories.map((cat, i) => (
          <li
            key={cat.id}
            className="flex items-center gap-2 rounded-2xl border border-border bg-card p-3"
          >
            <Tags className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate font-medium text-card-foreground">
              {cat.name}
            </span>
            <span className="shrink-0 text-xs text-muted-foreground">{i + 1}º</span>
            <button
              onClick={() => onMove(cat, -1)}
              disabled={i === 0}
              aria-label={`Subir ${cat.name}`}
              className={iconBtn}
            >
              <ArrowUp className="size-4" />
            </button>
            <button
              onClick={() => onMove(cat, 1)}
              disabled={i === categories.length - 1}
              aria-label={`Bajar ${cat.name}`}
              className={iconBtn}
            >
              <ArrowDown className="size-4" />
            </button>
            <button
              onClick={() => onRename(cat)}
              aria-label={`Renombrar ${cat.name}`}
              className={iconBtn}
            >
              <Pencil className="size-4" />
            </button>
            <button
              onClick={() => onDelete(cat)}
              aria-label={`Eliminar ${cat.name}`}
              className="flex size-9 items-center justify-center rounded-full bg-destructive/12 text-destructive"
            >
              <Trash2 className="size-4" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}