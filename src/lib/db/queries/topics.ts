import "server-only";
import type { DbClient } from "@/lib/db/client";
import type { Database } from "@/lib/db/types";
import type { Result } from "@/lib/result";
import { fetchAggregated } from "./aggregated";
import { ARTICLE_COLUMNS, PUBLIC_STATUSES, summarize } from "./articles";
import { many, one, readPublic } from "./run";
import type { QueryError, TopicDetail, TopicView } from "./types";

type TopicRow = Pick<
  Database["public"]["Tables"]["topics"]["Row"],
  | "id"
  | "slug"
  | "title"
  | "summary"
  | "state"
  | "confidence"
  | "confidence_score"
  | "section_slug"
  | "updated_at"
>;

const COLUMNS =
  "id, slug, title, summary, state, confidence, confidence_score, section_slug, updated_at";

export function topicHref(slug: string): string {
  return `/assunto/${slug}`;
}

async function withCounts(db: DbClient, rows: TopicRow[]): Promise<TopicView[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const [articles, items] = await Promise.all([
    db
      .from("articles")
      .select("topic_id")
      .in("topic_id", ids)
      .in("status", [...PUBLIC_STATUSES])
      .then(many),
    db.from("public_aggregated").select("topic_id, source_slug").in("topic_id", ids).then(many),
  ]);
  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    href: topicHref(r.slug),
    title: r.title,
    state: r.state,
    summary: r.summary,
    confidence: { level: r.confidence, score: Number(r.confidence_score) },
    sectionSlug: r.section_slug,
    updatedAt: r.updated_at,
    articleCount: articles.filter((a) => a.topic_id === r.id).length,
    sourceCount: new Set(items.filter((i) => i.topic_id === r.id).map((i) => i.source_slug)).size,
  }));
}

/** Assuntos em andamento (não encerrados), mais recentes primeiro. */
export async function fetchActiveTopics(db: DbClient, limit: number): Promise<TopicView[]> {
  const rows = await db
    .from("topics")
    .select(COLUMNS)
    .neq("state", "encerrado")
    .order("updated_at", { ascending: false })
    .limit(limit)
    .then(many);
  return withCounts(db, rows);
}

/** Assunto com matérias do CityNews e itens agregados. `null` quando não existe. */
export async function getTopicBySlug(
  slug: string,
): Promise<Result<TopicDetail | null, QueryError>> {
  return readPublic(async (db) => {
    const row = await db.from("topics").select(COLUMNS).eq("slug", slug).maybeSingle().then(one);
    if (!row) return null;
    const [[topic], articleRows, aggregated] = await Promise.all([
      withCounts(db, [row]),
      db
        .from("articles")
        .select(ARTICLE_COLUMNS)
        .eq("topic_id", row.id)
        .in("status", [...PUBLIC_STATUSES])
        .order("published_at", { ascending: false })
        .then(many),
      fetchAggregated(db, { topicId: row.id, limit: 30 }),
    ]);
    if (!topic) return null;
    return { ...topic, articles: await summarize(db, articleRows), aggregated };
  });
}
