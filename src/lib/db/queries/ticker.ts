import "server-only";
import { PUBLIC_STATUSES } from "./articles";
import { many, readPublic } from "./run";
import { pickTickerItems, scopeOf, type TickerItem } from "@/lib/ticker";

/** Ticker: 60 s, no cache de dados com a tag `ticker`. */
export const TICKER_REVALIDATE = 60;

const LOOKBACK_HOURS = 24;
const FETCH_LIMIT = 80;

/**
 * Manchetes do ticker: consulta enxuta das matérias públicas das últimas 24 h (a janela de 12 h
 * é aplicada em `pickTickerItems`). Falha ou banco ausente: lista vazia e o ticker some.
 */
export async function listTickerItems(now: Date = new Date()): Promise<TickerItem[]> {
  const since = new Date(now.getTime() - LOOKBACK_HOURS * 3_600_000).toISOString();
  const res = await readPublic(
    async (db) =>
      db
        .from("articles")
        .select("id, slug, title, status, published_at, topic_id, neighborhoods, section_slug")
        .in("status", [...PUBLIC_STATUSES])
        .gte("published_at", since)
        .order("published_at", { ascending: false })
        .limit(FETCH_LIMIT)
        .then(many),
    { tags: ["ticker", "home"], revalidate: TICKER_REVALIDATE },
  );
  if (!res.ok) return [];
  return pickTickerItems(
    res.value.map((r) => ({
      id: r.id,
      slug: r.slug,
      title: r.title,
      status: r.status,
      publishedAt: r.published_at,
      topicId: r.topic_id,
      newsScope: scopeOf({
        title: r.title,
        neighborhoods: r.neighborhoods ?? [],
        sectionSlug: r.section_slug,
      }),
    })),
    { now },
  );
}
