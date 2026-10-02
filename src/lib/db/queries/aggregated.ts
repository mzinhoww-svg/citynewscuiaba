import "server-only";
import type { DbClient } from "@/lib/db/client";
import type { Database } from "@/lib/db/types";
import { labelsFor } from "@/lib/labels";
import type { Result } from "@/lib/result";
import { many, readPublic } from "./run";
import type { AggregatedView, QueryError } from "./types";

type AggregatedRow = Pick<
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
>;

const COLUMNS =
  "id, original_title, canonical_url, source_name, source_slug, published_at, summary, section_slug, topic_id";

export interface AggregatedFilters {
  sourceSlugs?: string[];
  section?: string;
  topicId?: string;
  limit: number;
  /** No máximo um item por veículo (Panorama da home: diversidade de fontes). */
  onePerSource?: boolean;
}

/** Só aceita link http(s) para o domínio da fonte; o resto é descartado. */
function safeUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

export function toAggregatedView(row: AggregatedRow): AggregatedView | null {
  const url = safeUrl(row.canonical_url);
  if (!row.id || !url || !row.original_title || !row.source_name || !row.source_slug) return null;
  return {
    id: row.id,
    title: row.original_title,
    url,
    sourceName: row.source_name,
    sourceSlug: row.source_slug,
    publishedAt: row.published_at,
    summary: row.summary,
    sectionSlug: row.section_slug,
    topicId: row.topic_id,
    // Agregado nunca recebe rótulo de publicação; imagem não entra no card (sem permissão exibida).
    // O resumo é o próprio do CityNews (agente aggregate_summary): rótulo RESUMO POR IA.
    labels: labelsFor({
      kind: "aggregated",
      sourceName: row.source_name,
      hasAiSummary: Boolean(row.summary),
      publishMode: null,
      sponsored: false,
    }),
  };
}

export async function fetchAggregated(
  db: DbClient,
  f: AggregatedFilters,
): Promise<AggregatedView[]> {
  const limit = Math.max(1, Math.min(f.limit, 50));
  let q = db
    .from("public_aggregated")
    .select(COLUMNS)
    .not("published_at", "is", null)
    .order("published_at", { ascending: false })
    .limit(f.onePerSource ? limit * 6 : limit);
  if (f.sourceSlugs?.length) q = q.in("source_slug", f.sourceSlugs);
  if (f.section) q = q.eq("section_slug", f.section);
  if (f.topicId) q = q.eq("topic_id", f.topicId);
  const rows = await q.then(many);
  const views = rows.map(toAggregatedView).filter((v): v is AggregatedView => v !== null);
  if (!f.onePerSource) return views.slice(0, limit);
  const seen = new Set<string>();
  return views.filter((v) => !seen.has(v.sourceSlug) && seen.add(v.sourceSlug)).slice(0, limit);
}

/** Itens agregados (Panorama). Link sempre para o original; nunca página própria de leitura. */
export async function listAggregated(
  f: AggregatedFilters,
): Promise<Result<AggregatedView[], QueryError>> {
  return readPublic((db) => fetchAggregated(db, f));
}
