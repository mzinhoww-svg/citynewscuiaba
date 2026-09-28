import "server-only";
import { parseRuleRow } from "@/lib/rules/load";
import type { DraftView } from "./checklist";
import type { StudioContext } from "./context";

/** Regra ativa da categoria da editoria exige fonte primária? Sem regra válida: exige (falha fechada). */
export async function requiresPrimary(ctx: StudioContext, sectionSlug: string): Promise<boolean> {
  const [{ data: rule }, { data: sec }] = await Promise.all([
    ctx.db.from("rules").select("version, force_review, body").eq("active", true).maybeSingle(),
    ctx.db.from("sections").select("autonomy_category").eq("slug", sectionSlug).maybeSingle(),
  ]);
  if (!rule) return true;
  const parsed = parseRuleRow(rule);
  if (!parsed.ok) return true;
  const category = sec?.autonomy_category ?? sectionSlug;
  return parsed.value.categories[category]?.requirePrimary ?? false;
}

/** Matéria como o checklist de publicação a enxerga, lida com a sessão de quem pede. */
export async function loadDraftView(ctx: StudioContext, id: string): Promise<DraftView | null> {
  const { data: a } = await ctx.db
    .from("articles")
    .select("title, dek, section_slug, tags, neighborhoods, seo_title, seo_description")
    .eq("id", id)
    .maybeSingle();
  if (!a) return null;
  const [sources, media, suggestions, requirePrimary] = await Promise.all([
    ctx.db.from("article_sources").select("role, confirmed").eq("article_id", id),
    ctx.db.from("article_media").select("alt, media_assets(credit)").eq("article_id", id),
    ctx.db
      .from("article_suggestions")
      .select("id", { count: "exact", head: true })
      .eq("article_id", id)
      .eq("status", "open"),
    requiresPrimary(ctx, a.section_slug),
  ]);
  return {
    title: a.title,
    dek: a.dek,
    sectionSlug: a.section_slug,
    tags: a.tags,
    neighborhoods: a.neighborhoods,
    requirePrimary,
    sources: (sources.data ?? []).map((s) => ({
      role: s.role === "primary" ? "primary" : s.role === "secondary" ? "secondary" : "context",
      confirmed: s.confirmed,
    })),
    images: (media.data ?? []).map((m) => ({
      credit: m.media_assets?.credit ?? null,
      alt: m.alt,
    })),
    seoTitle: a.seo_title,
    seoDescription: a.seo_description,
    openSuggestions: suggestions.count ?? 0,
  };
}
