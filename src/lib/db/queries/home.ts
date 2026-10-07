import "server-only";
import { defaultHomeLayout, parseHomeLayout, type HomeModule } from "@/lib/admin/home-layout";
import { pickHomeSponsored } from "@/lib/ads/rules";
import { sourceLogoUrl } from "@/lib/sources/logo-path";
import type { DbClient } from "@/lib/db/client";
import type { Result } from "@/lib/result";
import { toAggregatedView } from "./aggregated";
import { createUsed, hasApprovedCover, type Used } from "@/lib/featured";
import { isEligibleForFeature } from "@/lib/geo/news-scope";
import { fetchRecentArticles, summarize } from "./articles";
import { fetchEvents } from "./events";
import { getFeaturedMany, requestFeaturedImages } from "./featured";
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
  TopicView,
} from "./types";

/** Blocos de editoria da home (docs/screens.md P01). */
export const HOME_SECTION_BLOCKS = ["politica", "economia", "cultura"] as const;

/** Home: 60 s (P1 Global Constraints), no cache de dados com a tag `home`. */
export const HOME_REVALIDATE = 60;

const NOW_COUNT = 6;
const HIGHLIGHT_COUNT = 3;
/** "Assuntos em destaque": assuntos lidos e quantos aparecem (só os com foto e sem repetição, R40). */
const TOPIC_POOL = 12;
const TOPIC_COUNT = 3;
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
    .select("slug, name, locality, logo_path, rec_pinned, rec_local_highlight")
    .eq("status", "active")
    .eq("rec_excluded", false)
    .order("rec_pinned", { ascending: false })
    .order("rec_local_highlight", { ascending: false })
    .order("name")
    .limit(limit)
    .then(many);
  return rows.flatMap((s) =>
    s.slug && s.name
      ? [
          {
            slug: s.slug,
            name: s.name,
            href: `/fontes/${s.slug}`,
            locality: s.locality ?? "",
            logo: sourceLogoUrl(s.logo_path),
          },
        ]
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

type MostReadRow = { article_id: string };

/** Parte pura de `rankMostRead`: dado o ranking de `public_most_read` já lido. */
export function rankMostReadFrom(
  ranked: readonly MostReadRow[],
  pool: readonly ArticleSummary[],
): ArticleSummary[] {
  const byId = new Map(pool.map((a) => [a.id, a]));
  const fromReads = ranked.flatMap((r) => byId.get(r.article_id) ?? []);
  const seen = new Set<string>();
  return [...fromReads, ...pool].filter((a) => {
    if (a.sponsored || seen.has(a.id)) return false;
    seen.add(a.id);
    return true;
  });
}

const mostReadQuery = (db: DbClient, hours: number) =>
  db.rpc("public_most_read", { p_hours: hours, p_limit: 10 }).then(many);

/**
 * Mais lidas na ordem de leitura: as lidas primeiro (ranking de `public_most_read`), depois o
 * resto da lista por recência. Sem patrocinadas. A home aplica o registro de "já exibidos" (R40)
 * por cima desta ordem.
 */
export async function rankMostRead(
  db: DbClient,
  pool: ArticleSummary[],
  hours = 24,
): Promise<ArticleSummary[]> {
  return rankMostReadFrom(await mostReadQuery(db, hours), pool);
}

/**
 * Tópicos da home com capa (R40): só assunto com foto aprovada numa matéria dele ainda não
 * exibida, nunca o assunto da manchete nem uma matéria que já saiu acima.
 */
export function topicsWithCover(
  topics: readonly TopicView[],
  pool: readonly ArticleSummary[],
  used: Used,
  take: number,
): TopicView[] {
  const coverOf = (t: TopicView): ArticleSummary | undefined =>
    pool.find(
      (a) =>
        a.topicId === t.id && !a.sponsored && hasApprovedCover(a.image) && !used.hasArticle(a.id),
    );
  const covers = new Map<string, ArticleSummary>();
  return used
    .takeTopics(topics, take, (t) => {
      const a = coverOf(t);
      if (a) covers.set(t.id, a);
      return a ? { id: a.id, topicId: a.topicId } : null;
    })
    .map((t) => ({ ...t, cover: covers.get(t.id)?.image }));
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
      // Leituras sem dependência numa rodada (UX-W5-T2, item 80): destaques, pinos e "mais lidas"
      // junto com a lista; a única segunda rodada é a hidratação dos cards (e as contagens dos
      // assuntos), que depende dela. Exclusões entre posições resolvidas em memória.
      const featuredSet = getFeaturedMany(db, ["home.lead", "home.destaques"]);
      const summaries = Promise.all([fetchRecentArticles(db, 60, "home"), featuredSet]).then(
        async ([rows, f]) => {
          const listed = new Set(rows.map((r) => r.id));
          const extra = f.pinnedRows.filter((r) => !listed.has(r.id));
          const all = await summarize(db, [...rows, ...extra]);
          return { articles: all.slice(0, rows.length), pinned: all.slice(rows.length) };
        },
      );
      // Só a página com o módulo "Mais lidas" precisa do ranking; a falha só derruba essa página.
      const mostReadRanking = mostReadQuery(db, 24).then(
        (rows) => ({ ok: true as const, rows }),
        (error: unknown) => ({ ok: false as const, error }),
      );
      const [
        { articles, pinned },
        featured,
        activeTopics,
        collections,
        events,
        sources,
        aggregated,
        modules,
        gate,
        ranking,
      ] = await Promise.all([
        summaries,
        featuredSet,
        fetchActiveTopics(db, TOPIC_POOL),
        fetchCollections(db, 4),
        fetchEvents(db, { limit: 3 }, now),
        fetchFeaturedSources(db, 8),
        fetchHomeAggregated(db, 4),
        fetchPublishedHomeLayout(db),
        fetchSponsoredGate(db),
        mostReadRanking,
      ]);
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

      // Registro de "já exibidos" (R40): cada módulo, na ordem em que a página o mostra, só leva o
      // que ainda não saiu em outro lugar; módulo sem item novo some.
      const used = createUsed();
      if (urgent) used.add(urgent);

      // Manchete (home.lead): pino manual > automático por janela, sempre com capa aprovada (R39).
      // Sem a tabela ou sem candidata, cai no comportamento anterior preferindo a mais recente com
      // capa; só sem nenhuma capa na lista a manchete sai sem foto.
      const featuredLead = featured.resolve("home.lead", {
        now,
        pool: articles,
        pinned,
        exclude: urgent ? [urgent.id] : [],
      });
      const rest = editorial.filter((a) => a.id !== urgent?.id);
      const lead =
        featuredLead.items[0] ?? rest.find((a) => hasApprovedCover(a.image)) ?? rest[0] ?? null;
      if (lead) used.add(lead);

      // Destaques (home.destaques): até 3 com capa, nunca a manchete nem a urgência.
      const featuredHighlights = featured.resolve("home.destaques", {
        now,
        pool: articles,
        pinned,
        exclude: [...(urgent ? [urgent.id] : []), ...(lead ? [lead.id] : [])],
      });
      const highlights = used.takeArticles(featuredHighlights.items, HIGHLIGHT_COUNT, (a) =>
        hasApprovedCover(a.image),
      );

      const nowList = used.takeArticles(editorial, NOW_COUNT);

      // Módulos abaixo da primeira dobra, na ordem publicada (A06).
      let topics: TopicView[] = [];
      let sectionBlocks: HomeData["sectionBlocks"] = [];
      let mostRead: ArticleSummary[] = [];
      for (const m of modules.filter((x) => x.enabled)) {
        if (m.id === "topics") {
          topics = topicsWithCover(activeTopics, editorial, used, TOPIC_COUNT);
        } else if (m.id === "sections") {
          sectionBlocks = HOME_SECTION_BLOCKS.map((slug) => {
            const inSection = editorial.filter((a) => a.section.slug === slug);
            const section = inSection[0]?.section ?? { slug, name: slug };
            return { section, articles: used.takeArticles(inSection, 3) };
          }).filter((b) => b.articles.length > 0);
        } else if (m.id === "most_read") {
          if (!ranking.ok) throw ranking.error;
          mostRead = used.takeArticles(rankMostReadFrom(ranking.rows, editorial), MOST_READ_COUNT);
        }
      }

      // Matéria sem capa que ganhou a posição pede imagem (R39): escrita de melhor esforço.
      await requestFeaturedImages(db, [featuredLead, featuredHighlights]);

      // Pauta quente (HOT-T3): só o que de fato saiu da posição (a manchete de reserva não conta).
      const hotIds = [
        ...(lead && featuredLead.hot.includes(lead.id) ? [lead.id] : []),
        ...highlights.filter((a) => featuredHighlights.hot.includes(a.id)).map((a) => a.id),
      ];

      return {
        generatedAt: now.toISOString(),
        urgent,
        lead,
        highlights,
        now: nowList,
        topics,
        collections,
        events,
        sectionBlocks,
        mostRead,
        sponsored: pickHomeSponsored(articles, gate),
        sources,
        aggregated,
        modules,
        hotIds,
      };
    },
    opts.cache ? { tags: ["home"], revalidate: HOME_REVALIDATE } : undefined,
  );
}
