import "server-only";
import type { Result } from "@/lib/result";
import { ARTICLE_COLUMNS, PUBLIC_STATUSES, summarize } from "./articles";
import { many, readPublic } from "./run";
import type { ArticleSummary, QueryError, SectionRef } from "./types";

export const SECTION_PAGE_SIZE = 12;

const PERIOD_HOURS = { "24h": 24, "7d": 24 * 7, "30d": 24 * 30 } as const;

/** Filtros já validados (P1-T5 faz o parse da URL; valor inválido nunca chega aqui). */
export interface SectionFilters {
  period?: keyof typeof PERIOD_HOURS;
  origin?: "original" | "normalized";
  sort?: "recent" | "relevance";
  /** Subeditoria (seção filha). */
  sub?: string;
}

export interface SectionPage {
  section: SectionRef & { parentSlug: string | null };
  subsections: SectionRef[];
  articles: ArticleSummary[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

/** Editoria paginada (12 por página). `null` quando a editoria não existe. */
export async function listSection(
  slug: string,
  filters: SectionFilters,
  page: number,
  now: Date = new Date(),
): Promise<Result<SectionPage | null, QueryError>> {
  return readPublic(async (db) => {
    const sections = await db.from("sections").select("slug, name, parent_slug").then(many);
    const section = sections.find((s) => s.slug === slug);
    if (!section) return null;
    const subsections = sections
      .filter((s) => s.parent_slug === slug)
      .map((s) => ({ slug: s.slug, name: s.name }));
    const scope =
      filters.sub && subsections.some((s) => s.slug === filters.sub)
        ? [filters.sub]
        : [slug, ...subsections.map((s) => s.slug)];

    const current = Number.isInteger(page) && page > 0 ? page : 1;
    const from = (current - 1) * SECTION_PAGE_SIZE;
    let q = db
      .from("articles")
      .select(ARTICLE_COLUMNS, { count: "exact" })
      .in("status", [...PUBLIC_STATUSES])
      .in("section_slug", scope);
    if (filters.origin) q = q.eq("kind", filters.origin);
    if (filters.period) {
      const since = new Date(now.getTime() - PERIOD_HOURS[filters.period] * 3_600_000);
      q = q.gte("published_at", since.toISOString());
    }
    if (filters.sort === "relevance") q = q.order("confidence_score", { ascending: false });
    q = q.order("published_at", { ascending: false }).range(from, from + SECTION_PAGE_SIZE - 1);

    const res = await q;
    if (res.error) throw new Error(res.error.message);
    const total = res.count ?? 0;
    return {
      section: { slug: section.slug, name: section.name, parentSlug: section.parent_slug },
      subsections,
      articles: await summarize(db, res.data),
      total,
      page: current,
      pageSize: SECTION_PAGE_SIZE,
      hasMore: from + SECTION_PAGE_SIZE < total,
    };
  });
}
