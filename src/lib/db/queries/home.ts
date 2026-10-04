import "server-only";
import { defaultHomeLayout, parseHomeLayout, type HomeModule } from "@/lib/admin/home-layout";
import { pickHomeSponsored } from "@/lib/ads/rules";
import type { DbClient } from "@/lib/db/client";
import type { Result } from "@/lib/result";
import { toAggregatedView } from "./aggregated";
import { isEligibleForFeature } from "@/lib/geo/news-scope";
import { fetchRecentArticles, summarize } from "./articles";
import { fetchEvents } from "./events";
import { many, readPublic } from "./run";
import { fetchActiveTopics } from "./topics";
import type { Database } from "@/lib/db/types";
import type {
  AggregatedView,
  ArticleSummary,
  CollectionView,
  HomeData,
  QueryError,
  SourceView,
} from "./types";

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

export type PanoramaRow = Pick<
  Database["public"]["Views"]["public_aggregated"]["Row"],
  | "id"
  | "original_title"
  | "canonical_url"
  | "source_name"
  | "source_slug"
  | "published_at"
  | "summary"
  | "section_slug"
  | "topic_id"
  | "source_editorial_score"
>;

/** Score editorial sem valor conta como o padrão da coluna (3). */
const scoreOf = (r: PanoramaRow): number => r.source_editorial_score ?? 3;

/**
 * "Veja também em outros portais" (D-F9): fonte com score editorial 1 fica de fora (continua
 * coletada e na cobertura do assunto); recência primeiro, score editorial desempata; no máximo um
 * item por veículo. O ranking de recomendação (`src/lib/ranking`) não muda.
 */
export function panoramaForHome(rows: readonly PanoramaRow[], limit: number): AggregatedView[] {
  const ordered = rows
    .filter((r) => scoreOf(r) > 1)
    .map((r, i) => ({ r, i, t: Date.parse(r.published_at ?? "") || 0 }))
    .sort((a, b) => b.t - a.t || scoreOf(b.r) - scoreOf(a.r) || a.i - b.i)
    .map(({ r }) => toAggregatedView(r))
    .filter((v): v is AggregatedView => v !== null);
  const seen = new Set<string>();
  return ordered.filter((v) => !seen.has(v.sourceSlug) && seen.add(v.sourceSlug)).slice(0, limit);
}

const PANORAMA_COLUMNS =
  "id, original_title, canonical_url, source_name, source_slug, published_at, summary, section_slug, topic_id, source_editorial_score";

async function fetchHomeAggregated(db: DbClient, limit: number): Promise<AggregatedView[]> {
  const rows = await db
    .from("public_aggregated")
    .select(PANORAMA_COLUMNS)
    .not("published_at", "is", null)
    .or("source_editorial_score.is.null,source_editorial_score.gt.1")
    .order("published_at", { ascending: false })
    .order("source_editorial_score", { ascending: false, nullsFirst: false })
    .limit(limit * 6)
    .then(many);
  return panoramaForHome(rows, limit);
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

/**
 * Ordem publicada dos módulos da home (A06). Sem versão publicada (ou com o banco fora),
 * vale a ordem padrão: a home nunca deixa de renderizar por causa do layout.
 */
/**
 * Patrocinado nativo (MS-T1): flag `sponsored_native_enabled` e categoria de autonomia de cada
 * editoria, para a home barrar subeditoria de Política, Justiça, Segurança e Saúde. Falha
 * fechada: erro de leitura conta como flag desligada.
 */
export async function fetchSponsoredGate(
  db: DbClient,
): Promise<{ enabled: boolean; categoryOf: (slug: string) => string | undefined }> {
  try {
    const [flag, sections] = await Promise.all([
      db
        .from("feature_flags")
        .select("enabled")
        .eq("key", "sponsored_native_enabled")
        .maybeSingle(),
      db.from("sections").select("slug, autonomy_category").then(many),
    ]);
    const category = new Map(sections.map((s) => [s.slug, s.autonomy_category ?? undefined]));
    return { enabled: flag.data?.enabled === true, categoryOf: (slug) => category.get(slug) };
  } catch {
    return { enabled: false, categoryOf: () => undefined };
  }
}

export async function fetchPublishedHomeLayout(db: DbClient): Promise<HomeModule[]> {
  try {
    const { data } = await db
      .from("home_layouts")
      .select("modules")
      .eq("status", "published")
      .maybeSingle();
    return data ? parseHomeLayout(data.modules) : defaultHomeLayout();
  } catch {
    return defaultHomeLayout();
  }
}

/** Tudo o que a home precisa, em uma leitura (P01). */
export async function getHomeData(
  now: Date = new Date(),
  opts: { cache?: boolean } = {},
): Promise<Result<HomeData, QueryError>> {
  return readPublic(
    async (db) => {
      const [rows, topics, collections, events, sources, aggregated, modules, gate] =
        await Promise.all([
          fetchRecentArticles(db, 60, "home"),
          fetchActiveTopics(db, 3),
          fetchCollections(db, 4),
          fetchEvents(db, { limit: 3 }, now),
          fetchFeaturedSources(db, 8),
          fetchHomeAggregated(db, 4),
          fetchPublishedHomeLayout(db),
          fetchSponsoredGate(db),
        ]);
      const articles = await summarize(db, rows);
      const editorial = articles.filter((a) => !a.sponsored);

      // Urgente: publicado por humano, ou automático e local/regional (ou comoção nacional): A2 e
      // A15. Notícia nacional sem comoção nunca ocupa a faixa Urgente.
      const urgent =
        editorial.find(
          (a) =>
            a.urgent &&
            (a.publishMode === "human" ||
              isEligibleForFeature({
                newsScope: a.newsScope,
                nationalCommotion: a.nationalCommotion ?? false,
              })),
        ) ?? null;
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
        sponsored: pickHomeSponsored(articles, gate),
        sources,
        aggregated,
        modules,
      };
    },
    opts.cache ? { tags: ["home"], revalidate: HOME_REVALIDATE } : undefined,
  );
}
