import "server-only";
import type { Result } from "@/lib/result";
import type { NewsEntry, UrlEntry } from "@/lib/seo/sitemap";
import { NEWS_WINDOW_HOURS } from "@/lib/seo/sitemap";
import { PUBLIC_STATUSES, articleHref } from "./articles";
import { eventHref } from "./events";
import { many, readPublic } from "./run";
import { topicHref } from "./topics";
import type { QueryError } from "./types";

/** Sitemaps: 300 s no cache de dados (tag `sitemap`). */
const CACHE = { tags: ["sitemap"], revalidate: 300 };
const MAX_URLS = 5000;

/** Matérias das últimas 48 h para o sitemap de notícias. Patrocinado não entra. */
export async function listNewsEntries(
  now: Date = new Date(),
): Promise<Result<NewsEntry[], QueryError>> {
  const since = new Date(now.getTime() - NEWS_WINDOW_HOURS * 3600_000).toISOString();
  return readPublic(async (db) => {
    const rows = await db
      .from("articles")
      .select("slug, title, published_at")
      .in("status", [...PUBLIC_STATUSES])
      .eq("sponsored", false)
      .gte("published_at", since)
      .order("published_at", { ascending: false })
      .limit(1000)
      .then(many);
    return rows.flatMap((r) =>
      r.published_at
        ? [{ path: articleHref(r.slug), title: r.title, publishedAt: r.published_at }]
        : [],
    );
  }, CACHE);
}

export async function listArticleEntries(): Promise<Result<UrlEntry[], QueryError>> {
  return readPublic(async (db) => {
    const rows = await db
      .from("articles")
      .select("slug, updated_at")
      .in("status", [...PUBLIC_STATUSES])
      .order("published_at", { ascending: false })
      .limit(MAX_URLS)
      .then(many);
    return rows.map((r) => ({ path: articleHref(r.slug), lastModified: r.updated_at }));
  }, CACHE);
}

export async function listTopicEntries(): Promise<Result<UrlEntry[], QueryError>> {
  return readPublic(async (db) => {
    const rows = await db
      .from("topics")
      .select("slug, updated_at")
      .order("updated_at", { ascending: false })
      .limit(MAX_URLS)
      .then(many);
    return rows.map((r) => ({ path: topicHref(r.slug), lastModified: r.updated_at }));
  }, CACHE);
}

/** Coleções editoriais e eventos confirmados (páginas do próprio CityNews). */
export async function listPageEntries(): Promise<Result<UrlEntry[], QueryError>> {
  return readPublic(async (db) => {
    const [collections, events] = await Promise.all([
      db.from("collections").select("slug, updated_at").eq("is_editorial", true).then(many),
      db
        .from("event_listings")
        .select("slug, starts_at")
        .order("starts_at", { ascending: false })
        .limit(1000)
        .then(many),
    ]);
    return [
      ...collections.map((c) => ({ path: `/colecoes/${c.slug}`, lastModified: c.updated_at })),
      ...events.map((e) => ({ path: eventHref(e.slug) })),
    ];
  }, CACHE);
}
