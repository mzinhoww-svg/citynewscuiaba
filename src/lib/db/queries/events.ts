import "server-only";
import { cache } from "react";
import type { DbClient } from "@/lib/db/client";
import type { Database } from "@/lib/db/types";
import type { Result } from "@/lib/result";
import { afterKey, cursorOf, decodeCursor, throughKey, type KeySpec, type Page } from "./cursor";
import { many, one, readPublic } from "./run";
import type { EventView, QueryError } from "./types";

type EventRow = Omit<
  Database["public"]["Tables"]["event_listings"]["Row"],
  | "tsv"
  | "source_id"
  | "dedupe_key"
  | "collected_at"
  | "source_ref"
  | "confirmed_by_source_id"
  | "evidence"
  | "locked_fields"
  | "withdrawn_at"
  | "updated_at"
>;

export const EVENT_COLUMNS =
  "id, slug, title, starts_at, ends_at, venue, neighborhood, price_cents, is_free, age_rating, category, accessibility, origin, confirmed_at, description, source_url, price_unknown";

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
    sourceUrl: r.source_url,
    priceUnknown: r.price_unknown,
  };
}

/** Ordem estável da agenda: início, id (desempate). */
const EVENT_KEYS: KeySpec[] = [
  { col: "starts_at", type: "ts", asc: true },
  { col: "id", type: "uuid", asc: true },
];

/** Tamanho da página da agenda e teto por consulta. */
export const AGENDA_PAGE = 100;
const EVENTS_CAP = 100;
/** Teto de eventos acumulados por "Carregar mais" (até o cursor, numa consulta). */
export const AGENDA_THROUGH_MAX = 1000;

interface EventQueryOptions {
  limit: number;
  where?: string;
  page?: boolean;
  countOnly?: boolean;
}

function eventsQuery(db: DbClient, f: EventFilters, now: Date, opts: EventQueryOptions) {
  // Normaliza para ISO: o valor entra no filtro `or` do PostgREST e nunca vem cru da URL.
  const parsed = f.from ? new Date(f.from) : now;
  const from = (Number.isNaN(parsed.getTime()) ? now : parsed).toISOString();
  // Evento em andamento continua na lista até terminar (sem fim: até o início).
  let q = db
    .from("event_listings")
    .select(EVENT_COLUMNS, {
      count: opts.page || opts.countOnly ? "exact" : undefined,
      head: opts.countOnly === true,
    })
    .or(`ends_at.gte."${from}",and(ends_at.is.null,starts_at.gte."${from}")`);
  const to = f.to ? new Date(f.to) : null;
  if (to && !Number.isNaN(to.getTime())) q = q.lt("starts_at", to.toISOString());
  if (f.category) q = q.eq("category", f.category);
  if (f.neighborhood) q = q.eq("neighborhood", f.neighborhood);
  if (f.freeOnly) q = q.eq("is_free", true);
  if (f.kidsOnly) q = q.eq("age_rating", "livre");
  if (f.origin) q = q.eq("origin", f.origin);
  if (f.excludeId) q = q.neq("id", f.excludeId);
  if (opts.where) q = q.or(opts.where);
  if (opts.countOnly) return q;
  for (const k of EVENT_KEYS) q = q.order(k.col, { ascending: k.asc });
  return q.limit(opts.page ? opts.limit + 1 : opts.limit);
}

export async function fetchEvents(
  db: DbClient,
  f: EventFilters,
  now: Date = new Date(),
): Promise<EventView[]> {
  const limit = Math.max(1, Math.min(f.limit ?? 50, EVENTS_CAP));
  return (await eventsQuery(db, f, now, { limit }).then(many)).map(toEventView);
}

export interface EventPageOptions {
  /** Eventos por página (padrão 100, teto 100). */
  limit?: number;
  /** Cursor opaco devolvido em `nextCursor`; inválido = volta ao começo. */
  cursor?: string;
}

/**
 * Página da agenda: `total` é a contagem real com os filtros (nunca corta em silêncio) e
 * `nextCursor` traz a página seguinte, sem repetir nem pular eventos no mesmo horário.
 */
export async function fetchEventPage(
  db: DbClient,
  f: EventFilters,
  { limit = AGENDA_PAGE, cursor }: EventPageOptions = {},
  now: Date = new Date(),
): Promise<Page<EventView>> {
  const size = Math.max(1, Math.min(limit, EVENTS_CAP));
  const values = cursor ? decodeCursor(cursor, EVENT_KEYS) : null;
  const pageQuery = eventsQuery(db, f, now, {
    limit: size,
    page: true,
    where: values ? afterKey(EVENT_KEYS, values) : undefined,
  });
  const [page, all] = await Promise.all([
    pageQuery,
    values ? eventsQuery(db, f, now, { limit: 1, countOnly: true }) : null,
  ]);
  if (page.error) throw new Error(page.error.message);
  if (all?.error) throw new Error(all.error.message);
  const raw = page.data ?? [];
  const more = raw.length > size;
  const kept = more ? raw.slice(0, size) : raw;
  const last = kept.at(-1);
  return {
    rows: kept.map(toEventView),
    total: (all ? all.count : page.count) ?? kept.length,
    nextCursor: more && last ? cursorOf(EVENT_KEYS, last) : null,
  };
}

/** Eventos do começo até o cursor, inclusive (o que "Carregar mais" já mostrou), até `max`. */
export async function fetchEventsThrough(
  db: DbClient,
  f: EventFilters,
  cursor: string,
  max: number = AGENDA_THROUGH_MAX,
  now: Date = new Date(),
): Promise<EventView[]> {
  const values = decodeCursor(cursor, EVENT_KEYS);
  if (!values) return [];
  const limit = Math.max(1, Math.min(max, AGENDA_THROUGH_MAX));
  return (
    await eventsQuery(db, f, now, { limit, where: throughKey(EVENT_KEYS, values) }).then(many)
  ).map(toEventView);
}

/** Agenda: eventos confirmados (a RLS esconde os não confirmados), em ordem de início. */
export async function listEvents(f: EventFilters = {}): Promise<Result<EventView[], QueryError>> {
  return readPublic((db) => fetchEvents(db, f));
}

/** Agenda pública paginada por cursor (`/agenda`). */
export async function listAgendaEvents(
  f: EventFilters,
  options: EventPageOptions = {},
): Promise<Result<Page<EventView>, QueryError>> {
  return readPublic((db) => fetchEventPage(db, f, options));
}

/** Eventos já mostrados até o cursor (inclusive), para "Carregar mais" acumular a lista. */
export async function listAgendaEventsThrough(
  f: EventFilters,
  cursor: string,
  max: number = AGENDA_THROUGH_MAX,
): Promise<Result<EventView[], QueryError>> {
  return readPublic((db) => fetchEventsThrough(db, f, cursor, max));
}

/**
 * Todos os eventos do intervalo, em páginas, até `max` (o calendário conta o mês inteiro em vez
 * de parar nos 100 primeiros).
 */
export async function listEventsInRange(
  f: EventFilters,
  max: number = AGENDA_THROUGH_MAX,
): Promise<Result<EventView[], QueryError>> {
  return readPublic(async (db) => {
    const out: EventView[] = [];
    let cursor: string | undefined;
    do {
      const page = await fetchEventPage(db, f, { limit: AGENDA_PAGE, cursor });
      out.push(...page.rows);
      cursor = page.nextCursor ?? undefined;
    } while (cursor && out.length < max);
    return out;
  });
}

/** Evento pelo slug; `null` quando não existe ou não foi confirmado. */
export const getEvent = cache(readEvent);

async function readEvent(slug: string): Promise<Result<EventView | null, QueryError>> {
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
