import "server-only";
import type { Scope } from "@/lib/auth/permissions";
import type { StudioContext } from "./context";

/**
 * Escopo de permissão de uma matéria: editoria e autoria. Lido com a sessão da pessoa; matéria
 * invisível pela RLS conta como inexistente (`null`).
 */
export async function articleScope(ctx: StudioContext, id: string): Promise<Scope | null> {
  const { data, error } = await ctx.db
    .from("articles")
    .select("section_slug, author_id")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return { section: data.section_slug, ...(data.author_id ? { ownerId: data.author_id } : {}) };
}
