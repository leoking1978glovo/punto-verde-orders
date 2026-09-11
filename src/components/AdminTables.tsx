import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Copy, EyeOff, Eye, Plus, QrCode, Trash2, X } from "lucide-react";
import {
  adminListTables,
  adminAddTable,
  adminUpdateTable,
  adminDeleteTable,
  type AdminTable,
} from "@/lib/admin.functions";

// ─────────────────────────────────────────────────────────────
// Sección "Mesas" del panel de administración.
// Insertar dentro de AdminDashboard, justo después del botón
// "Nuevo producto" (ver README-REFORMA-MESAS.md).
// ─────────────────────────────────────────────────────────────

export function AdminTables() {
  const queryClient = useQueryClient();
  const listTables = useServerFn(adminListTables);
  const addTable = useServerFn(adminAddTable);
  const updateTable = useServerFn(adminUpdateTable);
  const deleteTable = useServerFn(adminDeleteTable);

  const { data: tables = [], isLoading } = useQuery({
    queryKey: ["admin-tables"],
    queryFn: () => listTables({}) as Promise<AdminTable[]>,
  });

  const [qrFor, setQrFor] = useState<AdminTable | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["admin-tables"] });

  const qrTarget = qrFor ? `${window.location.origin}/?mesa=${qrFor.table_number}` : "";

  async function onAdd() {
    setBusy(true);
    try {
      const { table_number } = await addTable({ data: {} });
      refresh();
      // Muestra el QR de la mesa recién creada para imprimirlo
      setQrFor({ id: "new", table_number, label: `Mesa ${table_number}`, is_active: true });
    } finally {
      setBusy(false);
    }
  }

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(qrTarget);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard puede fallar en http o sin permisos; el enlace sigue visible
    }
  }

  return (
    <section className="mt-8">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-2xl">Mesas</h2>
        <button
          onClick={onAdd}
          disabled={busy}
          className="flex items-center gap-1.5 rounded-full bg-secondary px-4 py-2 text-sm font-semibold text-secondary-foreground disabled:opacity-50"
        >
          <Plus className="size-4" /> {busy ? "Añadiendo…" : "Añadir mesa"}
        </button>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Cada mesa se abre con su código QR (<code>?mesa=N</code>). Al añadir una mesa nueva,
        imprime su QR desde aquí; los QR que ya tienes impresos siguen funcionando.
      </p>

      {isLoading && <p className="py-6 text-center text-muted-foreground">Cargando mesas…</p>}

      <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {tables.map((t) => (
          <li
            key={t.id}
            className={`rounded-2xl border border-border bg-card p-3 ${
              t.is_active ? "" : "opacity-60"
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-display text-xl leading-none">Mesa {t.table_number}</p>
                {t.label && t.label !== `Mesa ${t.table_number}` && (
                  <p className="mt-1 truncate text-xs text-muted-foreground">{t.label}</p>
                )}
              </div>
              {!t.is_active && (
                <span className="rounded-full bg-destructive/12 px-2 py-0.5 text-[11px] font-medium text-destructive">
                  Inactiva
                </span>
              )}
            </div>
            <div className="mt-3 flex items-center gap-1.5">
              <button
                onClick={() => setQrFor(t)}
                aria-label={`Ver QR de la mesa ${t.table_number}`}
                className="flex size-9 items-center justify-center rounded-full bg-secondary text-secondary-foreground"
              >
                <QrCode className="size-4" />
              </button>
              <button
                onClick={async () => {
                  await updateTable({ data: { id: t.id, is_active: !t.is_active } });
                  refresh();
                }}
                className="flex flex-1 items-center justify-center gap-1 rounded-full bg-secondary py-2 text-xs font-semibold text-secondary-foreground"
              >
                {t.is_active ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                {t.is_active ? "Desactivar" : "Activar"}
              </button>
              <button
                onClick={async () => {
                  if (
                    !window.confirm(
                      `¿Eliminar la Mesa ${t.table_number}? Su QR dejará de aparecer en cocina (los pedidos ya creados no se borran).`,
                    )
                  )
                    return;
                  await deleteTable({ data: { id: t.id } });
                  refresh();
                }}
                aria-label={`Eliminar mesa ${t.table_number}`}
                className="flex size-9 items-center justify-center rounded-full bg-destructive/12 text-destructive"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          </li>
        ))}
      </ul>

      {qrFor && (
        <div
          className="fixed inset-0 z-40 flex items-end justify-center bg-foreground/40 p-4"
          onClick={() => setQrFor(null)}
        >
          <div
            className="w-full max-w-sm rounded-3xl bg-card p-6 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-2xl">Mesa {qrFor.table_number}</h3>
              <button
                onClick={() => setQrFor(null)}
                aria-label="Cerrar"
                className="flex size-9 items-center justify-center rounded-full bg-secondary text-secondary-foreground"
              >
                <X className="size-4" />
              </button>
            </div>
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(qrTarget)}`}
              alt={`Código QR de la mesa ${qrFor.table_number}`}
              className="mx-auto mt-4 size-52 rounded-xl border border-border"
            />
            <p className="mt-3 break-all text-xs text-muted-foreground">{qrTarget}</p>
            <div className="mt-4 flex gap-2">
              <button
                onClick={onCopy}
                className="flex flex-1 items-center justify-center gap-2 rounded-full bg-primary py-3 text-sm font-semibold text-primary-foreground"
              >
                <Copy className="size-4" /> {copied ? "¡Copiado!" : "Copiar enlace"}
              </button>
              <a
                href={`https://api.qrserver.com/v1/create-qr-code/?size=600x600&data=${encodeURIComponent(qrTarget)}`}
                target="_blank"
                rel="noreferrer"
                className="flex flex-1 items-center justify-center rounded-full bg-secondary py-3 text-sm font-semibold text-secondary-foreground"
              >
                Abrir grande
              </a>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Imprime este QR y ponlo en la mesa {qrFor.table_number}.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}