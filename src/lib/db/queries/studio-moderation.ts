import "server-only";
import type { Json } from "@/lib/db/types";
import { studioContext } from "@/lib/studio/context";

export interface SubmissionRow {
  id: string;
  createdAt: string;
  contactEmail: string;
  title: string;
  startsAt: string;
  endsAt: string | null;
  venue: string;
  neighborhood: string | null;
  priceCents: number | null;
  ageRating: string;
  link: string | null;
  description: string | null;
}

function rec(v: Json): Record<string, Json | undefined> {
  return typeof v === "object" && v !== null && !Array.isArray(v) ? v : {};
}
const str = (v: Json | undefined) => (typeof v === "string" ? v : null);

/** Sugestões de evento pendentes (E13), mais antigas primeiro (prazo de revisão de 48 h). */
export async function listSubmissions(): Promise<SubmissionRow[]> {
  const ctx = await studioContext();
  const { data, error } = await ctx.db
    .from("event_submissions")
    .select("id, payload, contact_email, created_at")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(100);
  if (error) throw new Error(`sugestões: ${error.message}`);
  return (data ?? []).map((s) => {
    const p = rec(s.payload);
    return {
      id: s.id,
      createdAt: s.created_at,
      contactEmail: s.contact_email,
      title: str(p.title) ?? "",
      startsAt: str(p.startsAt) ?? "",
      endsAt: str(p.endsAt),
      venue: str(p.venue) ?? "",
      neighborhood: str(p.neighborhood),
      priceCents: typeof p.priceCents === "number" ? p.priceCents : null,
      ageRating: str(p.ageRating) ?? "livre",
      link: str(p.link),
      description: str(p.description),
    };
  });
}

export interface ReportRow {
  id: string;
  kind: string;
  message: string | null;
  contactEmail: string | null;
  dueAt: string;
  createdAt: string;
  content: { ref: string; title: string | null; href: string | null; articleId: string | null };
}

/** Denúncias abertas (E14) por prazo; filtro opcional por tipo. */
export async function listReports(kind?: string): Promise<ReportRow[]> {
  const ctx = await studioContext();
  let q = ctx.db
    .from("reports")
    .select("id, kind, message, contact_email, due_at, created_at, content_ref")
    .eq("status", "open")
    .order("due_at", { ascending: true })
    .limit(100);
  if (kind) q = q.eq("kind", kind);
  const { data, error } = await q;
  if (error) throw new Error(`denúncias: ${error.message}`);
  const rows = data ?? [];
  const articleIds = rows
    .map((r) => /^article:([0-9a-f-]{36})$/.exec(r.content_ref)?.[1])
    .filter((x): x is string => Boolean(x));
  const { data: arts } = articleIds.length
    ? await ctx.db.from("articles").select("id, title, slug").in("id", articleIds)
    : { data: [] as { id: string; title: string; slug: string }[] };
  const byId = new Map((arts ?? []).map((a) => [a.id, a]));
  return rows.map((r) => {
    const aid = /^article:([0-9a-f-]{36})$/.exec(r.content_ref)?.[1] ?? null;
    const a = aid ? byId.get(aid) : undefined;
    return {
      id: r.id,
      kind: r.kind,
      message: r.message,
      contactEmail: r.contact_email,
      dueAt: r.due_at,
      createdAt: r.created_at,
      content: {
        ref: r.content_ref,
        title: a?.title ?? null,
        href: a ? `/estudio/materias/${a.id}` : null,
        articleId: a?.id ?? null,
      },
    };
  });
}
