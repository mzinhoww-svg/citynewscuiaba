import "server-only";
import type { DbClient } from "@/lib/db/client";
import type { SectionFilters, SectionPeriod } from "@/lib/filters/section";
import { startOfDay } from "@/lib/format/date";
import type { Result } from "@/lib/result";
import { ARTICLE_COLUMNS, PUBLIC_STATUSES, summarize } from "./articles";
import { many, readPublic } from "./run";
import type { ArticleSummary, QueryError, SectionRef } from "./types";

/** Editoria lista só o que foi publicado com o destino "editoria" (E06). */
const SECTION_DESTINATION = "section";

export type { SectionFilters } from "@/lib/filters/section";

export const SECTION_PAGE_SIZE = 12;
const MOST_READ_COUNT = 5;

const PERIOD_HOURS: Record<Exclude<SectionPeriod, "all">, number> = {
  "24h": 24,
  "7d": 24 * 7,
  "30d": 24 * 30,
};

export interface SectionPage {
  section: SectionRef & { parentSlug: string | null };
  subsections: SectionRef[];
  /** Subeditoria aplicada (a da URL só vale se for filha desta editoria). */
  activeSub: SectionRef | null;
  /** Matérias da página 1 até `page` (carregar mais acumula). */
  articles: ArticleSummary[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
  /** Publicação mais recente da editoria (sem filtros), para "Atualizado há n min". */
  latestAt: string | null;
  /** Matérias publicadas hoje (fuso de Cuiabá) na editoria. */
  todayCount: number;
  mostRead: ArticleSummary[];
}

type Filters = Partial<SectionFilters>;

interface Scope {
  section: { slug: string; name: string; parent_slug: string | null };
  subsections: SectionRef[];
  activeSub: SectionRef | null;
  /** Editoria + filhas (ou só a subeditoria ativa). */
  slugs: string[];
  /** Editoria + filhas, sem o filtro de subeditoria. */
  allSlugs: string[];
}

async function resolveScope(db: DbClient, slug: string, sub?: string): Promise<Scope | null> {
  const sections = await db.from("sections").select("slug, name, parent_slug").then(many);
  const section = sections.find((s) => s.slug === slug);
  if (!section) return null;
  const subsections = sections
    .filter((s) => s.parent_slug === slug)
    .map((s) => ({ slug: s.slug, name: s.name }));
  const activeSub = subsections.find((s) => s.slug === sub) ?? null;
  const allSlugs = [slug, ...subsections.map((s) => s.slug)];
  return {
    section,
    subsections,
    activeSub,
    slugs: activeSub ? [activeSub.slug] : allSlugs,
    allSlugs,
  };
}

/** Aplica origem, bairro e período (valores já validados por parseSectionFilters). */
function filtered(db: DbClient, slugs: string[], f: Filters, now: Date) {
  let q = db
    .from("articles")
    .select(ARTICLE_COLUMNS, { count: "exact" })
    .in("status", [...PUBLIC_STATUSES])
    .contains("publish_destinations", [SECTION_DESTINATION])
    .in("section_slug", slugs);
  if (f.origin === "original" || f.origin === "normalized") q = q.eq("kind", f.origin);
  if (f.neighborhood) q = q.contains("neighborhoods", [f.neighborhood]);
  if (f.period && f.period !== "all") {
    const since = new Date(now.getTime() - PERIOD_HOURS[f.period] * 3_600_000);
    q = q.gte("published_at", since.toISOString());
  }
  return q;
}

async function mostReadIn(db: DbClient, slugs: string[]): Promise<ArticleSummary[]> {
  const ranked = await db.rpc("public_most_read", { p_hours: 168, p_limit: 20 }).then(many);
  const ids = ranked.map((r) => r.article_id);
  const [read, recent] = await Promise.all([
    ids.length
      ? db
          .from("articles")
          .select(ARTICLE_COLUMNS)
          .in("id", ids)
          .in("section_slug", slugs)
          .in("status", [...PUBLIC_STATUSES])
          .contains("publish_destinations", [SECTION_DESTINATION])
          .then(many)
      : Promise.resolve([]),
    db
      .from("articles")
      .select(ARTICLE_COLUMNS)
      .in("section_slug", slugs)
      .in("status", [...PUBLIC_STATUSES])
      .contains("publish_destinations", [SECTION_DESTINATION])
      .eq("sponsored", false)
      .order("published_at", { ascending: false })
      .limit(MOST_READ_COUNT)
      .then(many),
  ]);
  const order = new Map(ids.map((id, i) => [id, i]));
  const byReads = read
    .filter((r) => !r.sponsored)
    .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  const rows = [...byReads, ...recent.filter((r) => !byReads.some((b) => b.id === r.id))];
  return summarize(db, rows.slice(0, MOST_READ_COUNT));
}

/**
 * Editoria com filtros já validados. Devolve as matérias da página 1 até `page` (12 por página,
 * "carregar mais" acumula e a URL guarda a página). `null` quando a editoria não existe.
 */
export async function listSection(
  slug: string,
  filters: Filters = {},
  page: number = filters.page ?? 1,
  now: Date = new Date(),
): Promise<Result<SectionPage | null, QueryError>> {
  return readPublic(async (db) => {
    const scope = await resolveScope(db, slug, filters.sub);
    if (!scope) return null;

    const current = Number.isInteger(page) && page > 0 ? page : 1;
    const until = current * SECTION_PAGE_SIZE;
    let q = filtered(db, scope.slugs, filters, now);
    if (filters.order === "relevance") q = q.order("confidence_score", { ascending: false });
    q = q.order("published_at", { ascending: false }).range(0, until - 1);

    const [res, latest, today, mostRead] = await Promise.all([
      q,
      db
        .from("articles")
        .select("published_at")
        .in("status", [...PUBLIC_STATUSES])
        .in("section_slug", scope.allSlugs)
        .order("published_at", { ascending: false })
        .limit(1)
        .then(many),
      db
        .from("articles")
        .select("id", { count: "exact", head: true })
        .in("status", [...PUBLIC_STATUSES])
        .in("section_slug", scope.allSlugs)
        .gte("published_at", startOfDay(now).toISOString()),
      mostReadIn(db, scope.allSlugs),
    ]);
    if (res.error) throw new Error(res.error.message);
    if (today.error) throw new Error(today.error.message);
    const total = res.count ?? 0;
    return {
      section: {
        slug: scope.section.slug,
        name: scope.section.name,
        parentSlug: scope.section.parent_slug,
      },
      subsections: scope.subsections,
      activeSub: scope.activeSub,
      articles: await summarize(db, res.data),
      total,
      page: current,
      pageSize: SECTION_PAGE_SIZE,
      hasMore: until < total,
      latestAt: latest[0]?.published_at ?? null,
      todayCount: today.count ?? 0,
      mostRead,
    };
  });
}

/** Quantas matérias entraram depois de `sinceIso` com os mesmos filtros (pílula de novas). */
export async function countSectionSince(
  slug: string,
  filters: Filters,
  sinceIso: string,
): Promise<Result<number | null, QueryError>> {
  return readPublic(async (db) => {
    const scope = await resolveScope(db, slug, filters.sub);
    if (!scope) return null;
    let q = db
      .from("articles")
      .select("id", { count: "exact", head: true })
      .in("status", [...PUBLIC_STATUSES])
      .contains("publish_destinations", [SECTION_DESTINATION])
      .in("section_slug", scope.slugs)
      .gt("published_at", sinceIso);
    if (filters.origin === "original" || filters.origin === "normalized") {
      q = q.eq("kind", filters.origin);
    }
    if (filters.neighborhood) q = q.contains("neighborhoods", [filters.neighborhood]);
    const res = await q;
    if (res.error) throw new Error(res.error.message);
    return res.count ?? 0;
  });
}

/**
 * Só confere se a editoria existe (consulta leve). A página chama antes de começar o streaming
 * para responder 404 de verdade à editoria desconhecida.
 */
export async function getSectionRef(slug: string): Promise<Result<SectionRef | null, QueryError>> {
  return readPublic(async (db) => {
    const rows = await db
      .from("sections")
      .select("slug, name")
      .eq("slug", slug)
      .limit(1)
      .then(many);
    const row = rows[0];
    return row ? { slug: row.slug, name: row.name } : null;
  });
}
