import "server-only";
import { SECTIONS } from "@/content/pt-BR/nav";
import type { DbClient } from "@/lib/db/client";
import { groupRefs, parseContentRef } from "@/lib/collections/refs";
import { startOfDay } from "@/lib/format/date";
import type { Result } from "@/lib/result";
import { toAggregatedView } from "./aggregated";
import { ARTICLE_COLUMNS, PUBLIC_STATUSES, fetchRecentArticles, summarize } from "./articles";
import { EVENT_COLUMNS, toEventView } from "./events";
import { fetchCollections, pickMostRead } from "./home";
import { many, one, readPublic } from "./run";
import { TOPIC_COLUMNS, fetchActiveTopics, withCounts } from "./topics";
import type {
  AggregatedView,
  CollectionDetail,
  CollectionEntry,
  ExploreData,
  QueryError,
  SectionShortcut,
} from "./types";

/** Explorar e coleção mudam pouco: 300 s no cache de dados. */
export const EXPLORE_REVALIDATE = 300;

const WEEK_HOURS = 168;

/** Contagem de matérias do dia por editoria de topo (subeditoria soma na mãe). */
export function countByTopSection(
  published: { section_slug: string }[],
  parents: Map<string, string | null>,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const a of published) {
    const top = parents.get(a.section_slug) ?? a.section_slug;
    out.set(top, (out.get(top) ?? 0) + 1);
  }
  return out;
}

/** Hub de descoberta (P07): editorias, assuntos, coleções e mais lidas da semana. */
export async function getExploreData(
  now: Date = new Date(),
): Promise<Result<ExploreData, QueryError>> {
  return readPublic(
    async (db) => {
      const [sectionRows, today, topics, collections, recent] = await Promise.all([
        db.from("sections").select("slug, parent_slug").then(many),
        db
          .from("articles")
          .select("section_slug")
          .in("status", [...PUBLIC_STATUSES])
          .gte("published_at", startOfDay(now).toISOString())
          .then(many),
        fetchActiveTopics(db, 3),
        fetchCollections(db, 12),
        fetchRecentArticles(db, 40),
      ]);
      const counts = countByTopSection(
        today,
        new Map(sectionRows.map((s) => [s.slug, s.parent_slug])),
      );
      const sections: SectionShortcut[] = SECTIONS.map((s) => ({
        slug: s.id,
        name: s.label,
        href: s.href,
        todayCount: counts.get(s.id) ?? 0,
      }));
      const pool = (await summarize(db, recent)).filter((a) => !a.sponsored);
      return {
        generatedAt: now.toISOString(),
        sections,
        topics,
        collections,
        mostRead: await pickMostRead(db, pool, new Set(), WEEK_HOURS),
      };
    },
    { tags: ["explore"], revalidate: EXPLORE_REVALIDATE },
  );
}

async function loadEntries(db: DbClient, refs: string[]): Promise<CollectionEntry[]> {
  const ids = groupRefs(refs);
  const [articleRows, topicRows, eventRows, aggRows] = await Promise.all([
    ids.article.length
      ? db
          .from("articles")
          .select(ARTICLE_COLUMNS)
          .in("id", ids.article)
          .in("status", [...PUBLIC_STATUSES])
          .then(many)
      : Promise.resolve([]),
    ids.topic.length
      ? db.from("topics").select(TOPIC_COLUMNS).in("id", ids.topic).then(many)
      : Promise.resolve([]),
    ids.event.length
      ? db.from("event_listings").select(EVENT_COLUMNS).in("id", ids.event).then(many)
      : Promise.resolve([]),
    ids.aggregated.length
      ? db
          .from("public_aggregated")
          .select(
            "id, original_title, canonical_url, source_name, source_slug, published_at, summary, section_slug, topic_id",
          )
          .in("id", ids.aggregated)
          .then(many)
      : Promise.resolve([]),
  ]);
  const [articles, topics] = await Promise.all([
    summarize(db, articleRows),
    withCounts(db, topicRows),
  ]);
  const byKey = new Map<string, CollectionEntry>();
  for (const item of articles) byKey.set(`article:${item.id}`, { kind: "article", item });
  for (const item of topics) byKey.set(`topic:${item.id}`, { kind: "topic", item });
  for (const r of eventRows) byKey.set(`event:${r.id}`, { kind: "event", item: toEventView(r) });
  for (const r of aggRows) {
    const item: AggregatedView | null = toAggregatedView(r);
    if (item) byKey.set(`aggregated:${item.id}`, { kind: "aggregated", item });
  }
  // Ordem da curadoria; item despublicado ou sem permissão some sem quebrar a coleção.
  return refs.flatMap((ref) => {
    const p = parseContentRef(ref);
    const entry = p ? byKey.get(`${p.kind}:${p.id}`) : undefined;
    return entry ? [entry] : [];
  });
}

/** Coleção editorial (P08) com capa, curador e itens na ordem. Inexistente = null (404). */
export async function getCollectionBySlug(
  slug: string,
): Promise<Result<CollectionDetail | null, QueryError>> {
  return readPublic(
    async (db) => {
      const c = await db
        .from("collections")
        .select("id, slug, title, description, curator_id, updated_at")
        .eq("slug", slug)
        .eq("is_editorial", true)
        .maybeSingle()
        .then(one);
      if (!c) return null;
      const [refs, curator] = await Promise.all([
        db
          .from("collection_items")
          .select("content_ref, position")
          .eq("collection_id", c.id)
          .order("position")
          .then(many),
        c.curator_id
          ? db
              .from("public_bylines")
              .select("display_name")
              .eq("id", c.curator_id)
              .maybeSingle()
              .then(one)
          : Promise.resolve(null),
      ]);
      const items = await loadEntries(
        db,
        refs.map((r) => r.content_ref),
      );
      return {
        id: c.id,
        slug: c.slug,
        href: `/colecoes/${c.slug}`,
        title: c.title,
        description: c.description,
        itemCount: items.length,
        curator: curator?.display_name ?? undefined,
        updatedAt: c.updated_at,
        items,
      };
    },
    { tags: [`collection:${slug}`], revalidate: EXPLORE_REVALIDATE },
  );
}
