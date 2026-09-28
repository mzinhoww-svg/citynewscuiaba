import "server-only";
import type { DbClient } from "@/lib/db/client";
import type { Database } from "@/lib/db/types";
import type { Result } from "@/lib/result";
import { fetchAggregated } from "./aggregated";
import { ARTICLE_COLUMNS, PUBLIC_STATUSES, summarize } from "./articles";
import { many, one, readPublic } from "./run";
import { BYLINE } from "@/content/pt-BR/portal";
import type { QueryError, TimelineEntry, TopicDetail, TopicState, TopicView } from "./types";

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

export const TOPIC_COLUMNS =
  "id, slug, title, summary, state, confidence, confidence_score, section_slug, updated_at";

export function topicHref(slug: string): string {
  return `/assunto/${slug}`;
}

export async function withCounts(db: DbClient, rows: TopicRow[]): Promise<TopicView[]> {
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
    .select(TOPIC_COLUMNS)
    .neq("state", "encerrado")
    .order("updated_at", { ascending: false })
    .limit(limit)
    .then(many);
  return withCounts(db, rows);
}

function parseFaq(raw: unknown): { q: string; a: string }[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((it) =>
    typeof it === "object" && it !== null && "q" in it && "a" in it
      ? typeof it.q === "string" && typeof it.a === "string"
        ? [{ q: it.q, a: it.a }]
        : []
      : [],
  );
}

const TIMELINE_MAX = 10;

/** Assunto com matérias do CityNews, itens agregados, convergências e linha do tempo. */
export async function getTopicBySlug(
  slug: string,
): Promise<Result<TopicDetail | null, QueryError>> {
  return readPublic(async (db) => {
    const row = await db
      .from("topics")
      .select(`${TOPIC_COLUMNS}, agreements, disagreements, unconfirmed, faq, summary_reviewed_by`)
      .eq("slug", slug)
      .maybeSingle()
      .then(one);
    if (!row) return null;
    const [[topic], articleRows, aggregated, reviewer] = await Promise.all([
      withCounts(db, [row]),
      db
        .from("articles")
        .select(ARTICLE_COLUMNS)
        .eq("topic_id", row.id)
        .in("status", [...PUBLIC_STATUSES])
        .order("published_at", { ascending: false })
        .then(many),
      fetchAggregated(db, { topicId: row.id, limit: 30 }),
      row.summary_reviewed_by
        ? db
            .from("public_bylines")
            .select("display_name")
            .eq("id", row.summary_reviewed_by)
            .maybeSingle()
            .then(one)
        : Promise.resolve(null),
    ]);
    if (!topic) return null;
    const articles = await summarize(db, articleRows);
    const timeline: TimelineEntry[] = [
      ...articles.map((a) => ({
        at: a.publishedAt,
        title: a.title,
        kind: "citynews" as const,
        href: a.href,
        sourceName: BYLINE.newsroom,
      })),
      ...aggregated.flatMap((i) =>
        i.publishedAt
          ? [
              {
                at: i.publishedAt,
                title: i.title,
                kind: "aggregated" as const,
                href: i.url,
                sourceName: i.sourceName,
              },
            ]
          : [],
      ),
    ]
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
      .slice(0, TIMELINE_MAX);
    return {
      ...topic,
      articles,
      aggregated,
      agreements: row.agreements,
      disagreements: row.disagreements,
      unconfirmed: row.unconfirmed,
      faq: parseFaq(row.faq),
      summaryReviewer: reviewer?.display_name ?? undefined,
      timeline,
    };
  });
}

export interface TopicListFilters {
  state?: TopicState;
  /** Só assuntos com atualização nos últimos 7 dias. */
  week?: boolean;
  section?: string;
}

/** Lista de assuntos (P06), por atualização mais recente. */
export async function listTopics(
  f: TopicListFilters = {},
  now: Date = new Date(),
): Promise<Result<TopicView[], QueryError>> {
  return readPublic(async (db) => {
    let q = db
      .from("topics")
      .select(TOPIC_COLUMNS)
      .order("updated_at", { ascending: false })
      .limit(60);
    if (f.state) q = q.eq("state", f.state);
    if (f.section) q = q.eq("section_slug", f.section);
    if (f.week) q = q.gte("updated_at", new Date(now.getTime() - 7 * 86_400_000).toISOString());
    return withCounts(db, await q.then(many));
  });
}

/** Título público de um assunto (RLS de leitura pública); `null` se não existe ou é interno. */
export async function getTopicTitle(slug: string): Promise<Result<string | null, QueryError>> {
  return readPublic(async (db) => {
    const row = await db.from("topics").select("title").eq("slug", slug).maybeSingle().then(one);
    return row?.title ?? null;
  });
}
