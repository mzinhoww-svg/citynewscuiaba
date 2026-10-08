import "server-only";
import type { DbClient } from "@/lib/db/client";
import type { Json } from "@/lib/db/types";
import type { RankedHit } from "@/lib/search/group";
import type { SearchHit } from "@/lib/search/types";
import { toAggregatedView } from "./aggregated";
import { ARTICLE_COLUMNS, PUBLIC_STATUSES, summarize } from "./articles";
import { EVENT_COLUMNS, eventSourceNames, toEventView } from "./events";
import { many, one } from "./run";
import { TOPIC_COLUMNS, withCounts } from "./topics";

const AGGREGATED_COLUMNS =
  "id, original_title, canonical_url, source_name, source_slug, published_at, summary, section_slug, topic_id";

/** Filtros aceitos por `search_hybrid` (0007_search.sql). */
export interface RpcSearchFilters {
  type?: "all" | "articles" | "topics" | "events" | "services" | "aggregated";
  origin?: "all" | "citynews" | "others";
  section?: string;
  source?: string;
  period?: "24h" | "7d" | "30d";
  /** Termos mínimos que o documento precisa ter (padrão: todos). */
  min_match?: number;
  min_similarity?: number;
  exclude_sponsored?: boolean;
}

export interface RankedRow extends RankedHit {
  /** Quantos termos da consulta o documento tem (0 = só pela parte vetorial). */
  matched: number;
}

const KINDS = new Set<RankedHit["kind"]>(["article", "topic", "event", "aggregated"]);

/** Consulta híbrida (FTS + vetor, RRF k = 60): ids em ordem de relevância. */
export async function rankSearch(
  db: DbClient,
  q: string,
  embedding: number[] | null,
  filters: RpcSearchFilters,
  limit = 50,
): Promise<RankedRow[]> {
  const rows = await db
    .rpc("search_hybrid", {
      p_q: q,
      p_filters: filters as unknown as Json,
      p_k: 60,
      p_limit: limit,
      ...(embedding ? { p_embedding: `[${embedding.join(",")}]` } : {}),
    })
    .then(many);
  return rows.flatMap((r) =>
    KINDS.has(r.kind as RankedHit["kind"])
      ? [
          {
            kind: r.kind as RankedHit["kind"],
            id: r.id,
            topicId: r.topic_id ?? null,
            score: Number(r.score),
            matched: r.matched ?? 0,
          },
        ]
      : [],
  );
}

/**
 * Lê o conteúdo público dos resultados com o cliente anônimo (RLS) e devolve na mesma ordem.
 * Item que a RLS esconde ou que não passa na validação pública some do resultado.
 */
export async function hydrateHits(db: DbClient, ranked: RankedHit[]): Promise<SearchHit[]> {
  const ids = (kind: RankedHit["kind"]) => ranked.filter((r) => r.kind === kind).map((r) => r.id);
  const [articleIds, aggregatedIds, eventIds, topicIds] = [
    ids("article"),
    ids("aggregated"),
    ids("event"),
    ids("topic"),
  ];
  const [articleRows, aggregatedRows, eventRows, topicRows] = await Promise.all([
    articleIds.length
      ? db
          .from("articles")
          .select(ARTICLE_COLUMNS)
          .in("id", articleIds)
          .in("status", [...PUBLIC_STATUSES])
          .then(many)
      : Promise.resolve([]),
    aggregatedIds.length
      ? db.from("public_aggregated").select(AGGREGATED_COLUMNS).in("id", aggregatedIds).then(many)
      : Promise.resolve([]),
    eventIds.length
      ? db.from("event_listings").select(EVENT_COLUMNS).in("id", eventIds).then(many)
      : Promise.resolve([]),
    topicIds.length
      ? db.from("topics").select(TOPIC_COLUMNS).in("id", topicIds).then(many)
      : Promise.resolve([]),
  ]);
  const [articles, topics] = await Promise.all([
    summarize(db, articleRows),
    withCounts(db, topicRows),
  ]);

  const byId = new Map<string, SearchHit>();
  for (const a of articles) byId.set(`article:${a.id}`, { kind: "article", score: 0, item: a });
  for (const row of aggregatedRows) {
    const v = toAggregatedView(row);
    if (v) byId.set(`aggregated:${v.id}`, { kind: "aggregated", score: 0, item: v });
  }
  const eventSources = await eventSourceNames(db, eventRows);
  for (const row of eventRows)
    byId.set(`event:${row.id}`, { kind: "event", score: 0, item: toEventView(row, eventSources) });
  for (const t of topics) byId.set(`topic:${t.id}`, { kind: "topic", score: 0, item: t });

  return ranked.flatMap((r) => {
    const hit = byId.get(`${r.kind}:${r.id}`);
    return hit ? [{ ...hit, score: r.score }] : [];
  });
}

/** Assuntos por id (cabeçalho dos grupos cujo assunto não veio no resultado). */
export async function fetchTopicsById(db: DbClient, topicIds: string[]) {
  if (topicIds.length === 0) return [];
  const rows = await db.from("topics").select(TOPIC_COLUMNS).in("id", topicIds).then(many);
  return withCounts(db, rows);
}

/** "Você quis dizer…" (trigramas sobre as palavras do acervo público). */
export async function didYouMean(db: DbClient, q: string): Promise<string | null> {
  return one(await db.rpc("search_did_you_mean", { p_q: q })) ?? null;
}

/** Títulos que começam com o que foi digitado (autocomplete). */
export async function suggestTitles(db: DbClient, prefix: string, limit = 6): Promise<string[]> {
  const rows = await db.rpc("search_suggest", { p_prefix: prefix, p_limit: limit }).then(many);
  return rows.map((r) => r.suggestion).filter((s): s is string => typeof s === "string");
}
