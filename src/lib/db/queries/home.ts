import "server-only";
import type { DbClient } from "@/lib/db/client";
import type { Result } from "@/lib/result";
import { fetchAggregated } from "./aggregated";
import { fetchRecentArticles, summarize } from "./articles";
import { fetchEvents } from "./events";
import { many, readPublic } from "./run";
import { fetchActiveTopics } from "./topics";
import type { ArticleSummary, CollectionView, HomeData, QueryError, SourceView } from "./types";

/** Blocos de editoria da home (docs/screens.md P01). */
export const HOME_SECTION_BLOCKS = ["politica", "economia", "cultura"] as const;

/** Home: 60 s (P1 Global Constraints), no cache de dados com a tag `home`. */
export const HOME_REVALIDATE = 60;

const NOW_COUNT = 6;
const MOST_READ_COUNT = 5;

export async function fetchCollections(db: DbClient, limit: number): Promise<CollectionView[]> {
  const rows = await db
    .from("collections")
    .select("id, slug, title, description, collection_items(count)")
    .eq("is_editorial", true)
    .order("title")
    .limit(limit)
    .then(many);
  return rows.map((c) => ({
    id: c.id,
    slug: c.slug,
    href: `/colecoes/${c.slug}`,
    title: c.title,
    description: c.description,
    itemCount: c.collection_items[0]?.count ?? 0,
  }));
}

async function fetchFeaturedSources(db: DbClient, limit: number): Promise<SourceView[]> {
  const rows = await db
    .from("public_sources")
    .select("slug, name, locality, rec_pinned, rec_local_highlight")
    .eq("status", "active")
    .eq("rec_excluded", false)
    .order("rec_pinned", { ascending: false })
    .order("rec_local_highlight", { ascending: false })
    .order("name")
    .limit(limit)
    .then(many);
  return rows.flatMap((s) =>
    s.slug && s.name
      ? [{ slug: s.slug, name: s.name, href: `/fontes/${s.slug}`, locality: s.locality ?? "" }]
      : [],
  );
}

/**
 * Mais lidas: leituras qualificadas das últimas `hours` (padrão 24 h); sem eventos (portal novo, sem
 * consentimento de métricas), as mais recentes que ainda não apareceram na página.
 */
export async function pickMostRead(
  db: DbClient,
  pool: ArticleSummary[],
  shown: Set<string>,
  hours = 24,
): Promise<ArticleSummary[]> {
  const ranked = await db.rpc("public_most_read", { p_hours: hours, p_limit: 10 }).then(many);
  const byId = new Map(pool.map((a) => [a.id, a]));
  const fromReads = ranked.flatMap((r) => byId.get(r.article_id) ?? []).filter((a) => !a.sponsored);
  const fallback = pool.filter((a) => !a.sponsored && !shown.has(a.id));
  const out: ArticleSummary[] = [];
  for (const a of [...fromReads, ...fallback, ...pool.filter((p) => !p.sponsored)]) {
    if (out.length >= MOST_READ_COUNT) break;
    if (!out.some((o) => o.id === a.id)) out.push(a);
  }
  return out;
}

/** Tudo o que a home precisa, em uma leitura (P01). */
export async function getHomeData(
  now: Date = new Date(),
  opts: { cache?: boolean } = {},
): Promise<Result<HomeData, QueryError>> {
  return readPublic(
    async (db) => {
      const [rows, topics, collections, events, sources, aggregated] = await Promise.all([
        fetchRecentArticles(db, 60, "home"),
        fetchActiveTopics(db, 3),
        fetchCollections(db, 4),
        fetchEvents(db, { limit: 3 }, now),
        fetchFeaturedSources(db, 8),
        fetchAggregated(db, { limit: 4, onePerSource: true }),
      ]);
      const articles = await summarize(db, rows);
      const editorial = articles.filter((a) => !a.sponsored);

      // Urgente só se publicado por humano (docs/screens.md P01).
      const urgent = editorial.find((a) => a.urgent && a.publishMode === "human") ?? null;
      const lead = editorial.find((a) => a.id !== urgent?.id) ?? null;
      const shown = new Set<string>([urgent?.id, lead?.id].filter((v): v is string => !!v));
      const nowList = editorial.filter((a) => !shown.has(a.id)).slice(0, NOW_COUNT);
      nowList.forEach((a) => shown.add(a.id));

      const sectionBlocks = HOME_SECTION_BLOCKS.map((slug) => {
        const inSection = editorial.filter((a) => a.section.slug === slug);
        const section = inSection[0]?.section ?? { slug, name: slug };
        const fresh = inSection.filter((a) => !shown.has(a.id));
        return { section, articles: (fresh.length ? fresh : inSection).slice(0, 3) };
      }).filter((b) => b.articles.length > 0);

      return {
        generatedAt: now.toISOString(),
        urgent,
        lead,
        now: nowList,
        topics,
        collections,
        events,
        sectionBlocks,
        mostRead: await pickMostRead(db, editorial, shown),
        sponsored: articles.find((a) => a.sponsored) ?? null,
        sources,
        aggregated,
      };
    },
    opts.cache ? { tags: ["home"], revalidate: HOME_REVALIDATE } : undefined,
  );
}
