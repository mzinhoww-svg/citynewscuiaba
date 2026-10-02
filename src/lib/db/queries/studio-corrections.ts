import "server-only";
import type { Json } from "@/lib/db/types";
import { studioContext } from "@/lib/studio/context";

export interface CorrectionRow {
  id: string;
  kind: string;
  requestedBy: string;
  dueAt: string;
  status: string;
  publishedAt: string | null;
  notified: number;
  article: { id: string; title: string; slug: string; sectionSlug: string };
}

/** Fila de correções (E08): abertas por prazo; publicadas mais recentes primeiro. */
export async function listCorrectionQueue(tab: "open" | "published"): Promise<CorrectionRow[]> {
  const ctx = await studioContext();
  let q = ctx.db
    .from("corrections")
    .select(
      "id, kind, requested_by, due_at, status, published_at, notified, articles(id, title, slug, section_slug)",
    );
  q =
    tab === "open"
      ? q.is("published_at", null).order("due_at", { ascending: true })
      : q.not("published_at", "is", null).order("published_at", { ascending: false });
  const { data, error } = await q.limit(100);
  if (error) throw new Error(`correções: ${error.message}`);
  return (data ?? []).flatMap((c) =>
    c.articles
      ? [
          {
            id: c.id,
            kind: c.kind,
            requestedBy: c.requested_by,
            dueAt: c.due_at,
            status: c.status,
            publishedAt: c.published_at,
            notified: c.notified,
            article: {
              id: c.articles.id,
              title: c.articles.title,
              slug: c.articles.slug,
              sectionSlug: c.articles.section_slug,
            },
          },
        ]
      : [],
  );
}

export interface CorrectionDetail extends CorrectionRow {
  publicNote: string;
  fields: string[];
  reportMessage: string | null;
  articleStatus: string;
  title: string;
  dek: string;
  body: Json;
  version: number;
}

export async function getCorrection(id: string): Promise<CorrectionDetail | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const ctx = await studioContext();
  const { data: c } = await ctx.db
    .from("corrections")
    .select(
      "id, kind, requested_by, due_at, status, published_at, notified, public_note, fields, report_id, articles(id, title, slug, section_slug, status, dek, body)",
    )
    .eq("id", id)
    .maybeSingle();
  if (!c || !c.articles) return null;
  const [{ data: v }, report] = await Promise.all([
    ctx.db
      .from("article_versions")
      .select("number")
      .eq("article_id", c.articles.id)
      .order("number", { ascending: false })
      .limit(1)
      .maybeSingle(),
    c.report_id
      ? ctx.db.from("reports").select("message").eq("id", c.report_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  return {
    id: c.id,
    kind: c.kind,
    requestedBy: c.requested_by,
    dueAt: c.due_at,
    status: c.status,
    publishedAt: c.published_at,
    notified: c.notified,
    publicNote: c.public_note,
    fields: c.fields,
    reportMessage: report.data?.message ?? null,
    article: {
      id: c.articles.id,
      title: c.articles.title,
      slug: c.articles.slug,
      sectionSlug: c.articles.section_slug,
    },
    articleStatus: c.articles.status,
    title: c.articles.title,
    dek: c.articles.dek,
    body: c.articles.body,
    version: v?.number ?? 0,
  };
}

export interface CalendarItem {
  id: string;
  title: string;
  kind: "scheduled" | "due" | "published";
  at: string;
  status: string;
  href: string;
}

/** Calendário editorial (E07): agendadas, prazos e publicadas entre `from` e `to`. */
export async function calendarItems(from: Date, to: Date): Promise<CalendarItem[]> {
  const ctx = await studioContext();
  const f = from.toISOString();
  const t = to.toISOString();
  const cols = "id, title, status, scheduled_for, due_at, published_at";
  const [sch, due, pub] = await Promise.all([
    ctx.db
      .from("articles")
      .select(cols)
      .eq("status", "scheduled")
      .gte("scheduled_for", f)
      .lt("scheduled_for", t),
    ctx.db
      .from("articles")
      .select(cols)
      .in("status", ["draft", "in_review", "changes_requested", "approved"])
      .gte("due_at", f)
      .lt("due_at", t),
    ctx.db
      .from("articles")
      .select(cols)
      .in("status", ["published", "updated"])
      .gte("published_at", f)
      .lt("published_at", t),
  ]);
  for (const r of [sch, due, pub]) if (r.error) throw new Error(`calendário: ${r.error.message}`);
  const href = (id: string) => `/estudio/materias/${id}`;
  const items: CalendarItem[] = [
    ...(sch.data ?? []).map((a) => ({
      id: a.id,
      title: a.title,
      kind: "scheduled" as const,
      at: a.scheduled_for ?? f,
      status: a.status,
      href: href(a.id),
    })),
    ...(due.data ?? []).map((a) => ({
      id: a.id,
      title: a.title,
      kind: "due" as const,
      at: a.due_at ?? f,
      status: a.status,
      href: href(a.id),
    })),
    ...(pub.data ?? []).map((a) => ({
      id: a.id,
      title: a.title,
      kind: "published" as const,
      at: a.published_at ?? f,
      status: a.status,
      href: href(a.id),
    })),
  ];
  return items.sort((a, b) => a.at.localeCompare(b.at));
}
