import "server-only";
import type { DbClient } from "@/lib/db/client";
import type { Database } from "@/lib/db/types";
import type { Result } from "@/lib/result";
import { many, one, readPublic } from "./run";
import type { EventView, QueryError } from "./types";

type EventRow = Database["public"]["Tables"]["event_listings"]["Row"];

export const EVENT_COLUMNS =
  "id, slug, title, starts_at, ends_at, venue, neighborhood, price_cents, is_free, age_rating, category, accessibility, origin, confirmed_at, description";

export interface EventFilters {
  /** ISO; padrão = agora (só eventos que ainda não terminaram). */
  from?: string;
  to?: string;
  category?: string;
  neighborhood?: string;
  freeOnly?: boolean;
  /** Só classificação livre (para crianças). */
  kidsOnly?: boolean;
  origin?: "official" | "organizer" | "reader";
  excludeId?: string;
  limit?: number;
}

export function eventHref(slug: string): string {
  return `/agenda/${slug}`;
}

export function toEventView(r: EventRow): EventView {
  return {
    id: r.id,
    slug: r.slug,
    href: eventHref(r.slug),
    title: r.title,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    venue: r.venue,
    neighborhood: r.neighborhood,
    priceCents: r.price_cents,
    isFree: r.is_free ?? (r.price_cents ?? 0) === 0,
    ageRating: r.age_rating,
    category: r.category,
    accessibility: r.accessibility,
    origin: r.origin === "official" || r.origin === "reader" ? r.origin : "organizer",
    description: r.description,
    confirmedAt: r.confirmed_at,
  };
}

export async function fetchEvents(
  db: DbClient,
  f: EventFilters,
  now: Date = new Date(),
): Promise<EventView[]> {
  // Normaliza para ISO: o valor entra no filtro `or` do PostgREST e nunca vem cru da URL.
  const parsed = f.from ? new Date(f.from) : now;
  const from = (Number.isNaN(parsed.getTime()) ? now : parsed).toISOString();
  // Evento em andamento continua na lista até terminar (sem fim: até o início).
  let q = db
    .from("event_listings")
    .select(EVENT_COLUMNS)
    .or(`ends_at.gte."${from}",and(ends_at.is.null,starts_at.gte."${from}")`)
    .order("starts_at", { ascending: true })
    .limit(Math.max(1, Math.min(f.limit ?? 50, 100)));
  const to = f.to ? new Date(f.to) : null;
  if (to && !Number.isNaN(to.getTime())) q = q.lt("starts_at", to.toISOString());
  if (f.category) q = q.eq("category", f.category);
  if (f.neighborhood) q = q.eq("neighborhood", f.neighborhood);
  if (f.freeOnly) q = q.eq("is_free", true);
  if (f.kidsOnly) q = q.eq("age_rating", "livre");
  if (f.origin) q = q.eq("origin", f.origin);
  if (f.excludeId) q = q.neq("id", f.excludeId);
  return (await q.then(many)).map(toEventView);
}

/** Agenda: eventos confirmados (a RLS esconde os não confirmados), em ordem de início. */
export async function listEvents(f: EventFilters = {}): Promise<Result<EventView[], QueryError>> {
  return readPublic((db) => fetchEvents(db, f));
}

/** Evento pelo slug; `null` quando não existe ou não foi confirmado. */
export async function getEvent(slug: string): Promise<Result<EventView | null, QueryError>> {
  return readPublic(async (db) => {
    const row = await db
      .from("event_listings")
      .select(EVENT_COLUMNS)
      .eq("slug", slug)
      .maybeSingle()
      .then(one);
    return row ? toEventView(row) : null;
  });
}
