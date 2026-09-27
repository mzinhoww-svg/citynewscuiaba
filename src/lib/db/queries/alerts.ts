import "server-only";
import type { AlertItem } from "@/lib/alerts/match";
import type { Result } from "@/lib/result";
import { articleHref, PUBLIC_STATUSES } from "./articles";
import { eventHref } from "./events";
import { many, readPublic } from "./run";
import type { QueryError } from "./types";

/** Janela máxima das novidades para alertas (quem ficou 2 dias sem abrir não recebe enxurrada). */
const MAX_WINDOW_MS = 48 * 3_600_000;

/**
 * Novidades públicas desde `since` para os alertas de navegador (P18): matérias publicadas
 * (com bairros, editoria, assunto público e urgência) e eventos confirmados na agenda.
 * Leitura anônima sob RLS: assunto interno e evento não confirmado nunca aparecem.
 */
export async function listAlertItems(
  since: Date,
  now: Date = new Date(),
): Promise<Result<AlertItem[], QueryError>> {
  const from = new Date(Math.max(since.getTime(), now.getTime() - MAX_WINDOW_MS)).toISOString();
  return readPublic(async (db) => {
    const [articles, events] = await Promise.all([
      db
        .from("articles")
        .select("id, slug, title, section_slug, neighborhoods, topic_id, urgent, published_at")
        .in("status", [...PUBLIC_STATUSES])
        .eq("sponsored", false)
        .gte("published_at", from)
        .order("published_at", { ascending: false })
        .limit(50)
        .then(many),
      db
        .from("event_listings")
        .select("id, slug, title, confirmed_at")
        .gte("confirmed_at", from)
        .order("confirmed_at", { ascending: false })
        .limit(20)
        .then(many),
    ]);
    const topicIds = [...new Set(articles.flatMap((a) => (a.topic_id ? [a.topic_id] : [])))];
    const topics = topicIds.length
      ? await db.from("topics").select("id, slug").in("id", topicIds).then(many)
      : [];
    const topicSlug = new Map(topics.map((t) => [t.id, t.slug]));
    return [
      ...articles.flatMap((a): AlertItem[] =>
        a.published_at
          ? [
              {
                id: `article:${a.id}`,
                kind: "article",
                title: a.title,
                href: articleHref(a.slug),
                section: a.section_slug,
                neighborhoods: a.neighborhoods ?? [],
                topicSlug: a.topic_id ? (topicSlug.get(a.topic_id) ?? null) : null,
                urgent: a.urgent,
                publishedAt: a.published_at,
              },
            ]
          : [],
      ),
      ...events.flatMap((e): AlertItem[] =>
        e.confirmed_at
          ? [
              {
                id: `event:${e.id}`,
                kind: "event",
                title: e.title,
                href: eventHref(e.slug),
                section: "agenda",
                neighborhoods: [],
                topicSlug: null,
                urgent: false,
                publishedAt: e.confirmed_at,
              },
            ]
          : [],
      ),
    ];
  });
}
