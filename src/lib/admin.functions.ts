import { createServerFn } from "@tanstack/react-start";
import { useSession } from "@tanstack/react-start/server";
import { createHash, timingSafeEqual } from "node:crypto";

type AdminSession = { unlocked?: boolean };

function sessionConfig() {
  return {
    password: process.env["ADMIN_SESSION_SECRET"]!,
    name: "pv-admin",
    maxAge: 60 * 60 * 8,
    cookie: { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/" },
  };
}

function matches(input: string, expected: string) {
  const a = createHash("sha256").update(input, "utf8").digest();
  const b = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(a, b);
}

async function requireUnlocked() {
  const session = await useSession<AdminSession>(sessionConfig());
  if (!session.data.unlocked) throw new Error("No autorizado");
}

export type AdminMenuItem = {
  id: string;
  category: string;
  name: string;
  description: string;
  price: number;
  sort_order: number;
  available: boolean;
  image_url: string;
  tags: string[];
};

export const adminStatus = createServerFn({ method: "GET" }).handler(async () => {
  const session = await useSession<AdminSession>(sessionConfig());
  return { unlocked: session.data.unlocked === true };
});

export const adminLogin = createServerFn({ method: "POST" })
  .inputValidator((data: { password: string }) => data)
  .handler(async ({ data }) => {
    const expected = process.env["ADMIN_PASSWORD"];
    if (!expected) throw new Error("Falta configurar la contraseña del panel");
    if (!data.password || !matches(data.password, expected)) {
      return { ok: false as const };
    }
    const session = await useSession<AdminSession>(sessionConfig());
    await session.update({ unlocked: true });
    return { ok: true as const };
  });

export const adminLogout = createServerFn({ method: "POST" }).handler(async () => {
  const session = await useSession<AdminSession>(sessionConfig());
  await session.clear();
  return { ok: true as const };
});

export const adminListItems = createServerFn({ method: "GET" }).handler(
  async (): Promise<AdminMenuItem[]> => {
    await requireUnlocked();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("menu_items")
      .select("id, category, name, description, price, sort_order, available, image_url, tags")
      .order("category")
      .order("sort_order");
    if (error) throw error;
    return (data ?? []).map((d) => ({ ...d, price: Number(d.price) }));
  },
);

export type MenuItemInput = {
  id?: string;
  category: string;
  name: string;
  description: string;
  price: number;
  sort_order: number;
  available: boolean;
  image_url: string;
  tags: string[];
};

export const adminSaveItem = createServerFn({ method: "POST" })
  .inputValidator((data: MenuItemInput) => {
    if (!data.name?.trim()) throw new Error("El nombre es obligatorio");
    if (!data.category?.trim()) throw new Error("La categoría es obligatoria");
    if (!Number.isFinite(data.price) || data.price < 0) throw new Error("Precio inválido");
    return data;
  })
  .handler(async ({ data }) => {
    await requireUnlocked();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const row = {
      category: data.category.trim(),
      name: data.name.trim(),
      description: data.description?.trim() ?? "",
      price: data.price,
      sort_order: data.sort_order ?? 0,
      available: data.available,
      image_url: data.image_url?.trim() ?? "",
      tags: data.tags ?? [],
    };
    if (data.id) {
      const { error } = await supabaseAdmin.from("menu_items").update(row).eq("id", data.id);
      if (error) throw error;
    } else {
      const { error } = await supabaseAdmin.from("menu_items").insert(row);
      if (error) throw error;
    }
    return { ok: true as const };
  });

export const adminDeleteItem = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    await requireUnlocked();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("menu_items").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true as const };
  });

export const adminToggleAvailable = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string; available: boolean }) => data)
  .handler(async ({ data }) => {
    await requireUnlocked();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("menu_items")
      .update({ available: data.available })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true as const };
  });
