import "server-only";
import { cache } from "react";
import { AGENDA } from "@/content/pt-BR/portal-agenda";
import type { DbClient } from "@/lib/db/client";
import type { Database } from "@/lib/db/types";
import { creditName } from "@/lib/media/credit";
import { mediaHref } from "@/lib/media/serve";
import type { Result } from "@/lib/result";
import { afterKey, cursorOf, decodeCursor, throughKey, type KeySpec, type Page } from "./cursor";
import { many, one, readPublic } from "./run";
import type { EventImage, EventView, QueryError } from "./types";

/** Lugar do Guia embutido (`venues` pela FK `venue_id`); a RLS devolve `null` se não é público. */
type GuideVenueRef = { slug: string; status: string } | null;

type MediaAssetRow = Database["public"]["Tables"]["media_assets"]["Row"];
/**
 * Imagem do evento embutida (`media_assets` pela FK `media_id`), com os campos do Media Registry
 * que decidem se ela pode aparecer. A RLS pública já devolve `null` para ativo não aprovado ou
 * reprodução com a flag `image_reproduction_enabled` desligada.
 */
export type EventMediaRef = Pick<
  MediaAssetRow,
  | "id"
  | "kind"
  | "status"
  | "origin_url"
  | "page_url"
  | "source_id"
  | "source_name"
  | "credit"
  | "license_until"
  | "removed_at"
  | "rights_status"
> | null;

type EventRow = Omit<
  Database["public"]["Tables"]["event_listings"]["Row"],
  | "tsv"
  | "source_id"
  | "dedupe_key"
  | "collected_at"
  | "evidence"
  | "locked_fields"
  | "withdrawn_at"
  | "updated_at"
> & { guide_venue?: GuideVenueRef; media?: EventMediaRef };

/**
 * Colunas públicas do evento. `guide_venue` (→ `venueSlug`) depende da RLS de `venues` lida como
 * `anon`: lugar fora do Guia público vem `null`. Nunca ler com service role para saída pública.
 */
export const EVENT_COLUMNS =
  "id, slug, title, starts_at, ends_at, venue, neighborhood, price_cents, is_free, age_rating, category, accessibility, origin, confirmed_at, description, source_url, price_unknown, source_ref, confirmed_by_source_id, venue_id, guide_venue:venues(slug, status), organizer, featured_until, media_id, media:media_assets(id, kind, status, origin_url, page_url, source_id, source_name, credit, license_until, removed_at, rights_status)";

export interface EventFilters {
  /** ISO; padrão = agora (só eventos que ainda não terminaram). */
  from?: string;
  to?: string;
  category?: string;
  neighborhood?: string;
  freeOnly?: boolean;
  /** Só classificação livre (para crianças). */
  kidsOnly?: boolean;
  origin?: "official" | "organizer" | "reader" | "newsroom";
  /** Só eventos ligados a este lugar do Guia (`venue_id`). */
  venueId?: string;
  /** Faixas etárias aceitas (`?idade=`, `agesUpTo`); `consulte` nunca entra num filtro. */
  ages?: readonly string[];
  /** Só eventos em destaque (`featured_until` ≥ agora). */
  featuredOnly?: boolean;
  excludeId?: string;
  limit?: number;
}

export function eventHref(slug: string): string {
  return `/agenda/${slug}`;
}

/** Fonte pública de evento (nome e se confirma), por id. */
export type EventSourceNames = ReadonlyMap<string, { name: string; confirms: boolean }>;

const EVENT_ORIGINS = ["official", "organizer", "reader", "newsroom"] as const;

/**
 * Imagem pública do evento pelas regras do Media Registry (D-02; visão `media_registry`, que o
 * `anon` não lê): só ativo aprovado, nunca bloqueado, retirado a pedido (`removed_at`) nem com a
 * validade anterior a hoje (como `media_rights_status_for`). Variantes 480 (card) e 960 (página)
 * pela rota própria, que cai no original quando a variante não existe.
 */
export function eventImage(
  m: EventMediaRef | undefined,
  title: string,
  now: Date,
): EventImage | null {
  if (!m || m.status !== "approved" || m.removed_at) return null;
  if (m.rights_status === "blocked" || m.rights_status === "expired") return null;
  if (m.license_until && m.license_until.slice(0, 10) < now.toISOString().slice(0, 10)) return null;
  const src = mediaHref(m.id);
  const reproduction = m.kind === "reproduction";
  // O crédito gravado na reprodução já é a legenda inteira ("Foto: reprodução web · Fonte"): a
  // tela usa o nome da fonte (ou o site da página) e a legenda monta o aviso uma vez só.
  const credit = reproduction
    ? creditName(
        {
          sourceName: m.source_name,
          sourceId: m.source_id,
          originUrl: m.origin_url,
          pageUrl: m.page_url,
        },
        [],
      )
    : (m.credit ?? undefined);
  return {
    src,
    src480: `${src}?w=480`,
    src960: `${src}?w=960`,
    alt: AGENDA.imageAlt(title),
    kind: m.kind,
    ...(credit ? { credit } : {}),
    // "Ver original" vai para a página do evento na fonte, nunca para o arquivo da imagem.
    ...(reproduction && m.page_url ? { originUrl: m.page_url } : {}),
  };
}

/** Em destaque: `featured_until` ainda não passou. */
export function isFeatured(featuredUntil: string | null, now: Date): boolean {
  return !!featuredUntil && Date.parse(featuredUntil) >= now.getTime();
}

/**
 * Lista da home (B5): até `limit` destacados antes dos demais, sem repetir evento, no total de
 * `limit` itens.
 */
export function featuredFirst(
  featured: readonly EventView[],
  upcoming: readonly EventView[],
  limit: number,
): EventView[] {
  const out: EventView[] = [];
  const seen = new Set<string>();
  for (const e of [...featured.slice(0, limit), ...upcoming]) {
    if (out.length >= limit) break;
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    out.push(e);
  }
  return out;
}

export function toEventView(
  r: EventRow,
  sources: EventSourceNames = new Map(),
  now: Date = new Date(),
): EventView {
  const origin = EVENT_ORIGINS.find((o) => o === r.origin) ?? "organizer";
  const source = r.source_ref ? sources.get(r.source_ref) : undefined;
  const confirmedBy = r.confirmed_by_source_id ? sources.get(r.confirmed_by_source_id) : undefined;
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
    origin,
    sourceName: source?.name ?? null,
    confirmedByName: confirmedBy?.name ?? null,
    confirmed:
      origin === "official" ||
      origin === "newsroom" ||
      source?.confirms === true ||
      r.confirmed_by_source_id !== null,
    description: r.description,
    confirmedAt: r.confirmed_at,
    sourceUrl: r.source_url,
    priceUnknown: r.price_unknown,
    venueSlug: r.venue_id && r.guide_venue?.status === "active" ? r.guide_venue.slug : null,
    organizer: r.organizer?.trim() || null,
    image: eventImage(r.media, r.title, now),
    featured: isFeatured(r.featured_until, now),
  };
}

/** Nomes públicos das fontes citadas pelas linhas (`public_event_sources`; `sources` é da equipe). */
export async function eventSourceNames(db: DbClient, rows: EventRow[]): Promise<EventSourceNames> {
  const ids = [
    ...new Set(
      rows.flatMap((r) => [r.source_ref, r.confirmed_by_source_id]).filter((x): x is string => !!x),
    ),
  ];
  if (ids.length === 0) return new Map();
  const found = await db
    .from("public_event_sources")
    .select("id, name, confirms")
    .in("id", ids)
    .then(many);
  return new Map(
    found.flatMap((s) =>
      s.id && s.name ? [[s.id, { name: s.name, confirms: s.confirms === true }] as const] : [],
    ),
  );
}

/** Linhas da agenda prontas para a tela, com a origem e a confirmação resolvidas. */
export async function toEventViews(
  db: DbClient,
  rows: EventRow[],
  now: Date = new Date(),
): Promise<EventView[]> {
  const names = await eventSourceNames(db, rows);
  return rows.map((r) => toEventView(r, names, now));
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
  if (f.venueId) q = q.eq("venue_id", f.venueId);
  if (f.ages) q = q.in("age_rating", [...f.ages]);
  if (f.featuredOnly) q = q.gte("featured_until", now.toISOString());
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
  return toEventViews(db, await eventsQuery(db, f, now, { limit }).then(many), now);
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
    rows: await toEventViews(db, kept, now),
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
  return toEventViews(
    db,
    await eventsQuery(db, f, now, { limit, where: throughKey(EVENT_KEYS, values) }).then(many),
    now,
  );
}

/** Faixa "Em destaque" do topo de `/agenda` e da home (B5): no máximo 6 por consulta. */
export const FEATURED_EVENTS_LIMIT = 6;

/** Eventos em destaque que ainda não terminaram, por início. */
export async function listFeaturedEvents(
  limit: number = FEATURED_EVENTS_LIMIT,
): Promise<Result<EventView[], QueryError>> {
  return readPublic((db) => fetchEvents(db, { featuredOnly: true, limit }));
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

/** Próximos eventos de um lugar do Guia na página do lugar (ARD-T3). */
export const VENUE_EVENTS_LIMIT = 5;
/**
 * Cache da leitura na página do lugar (ISR de 1 h): tag `agenda`, a mesma que o Estúdio e a
 * publicação automática de evento revalidam, e no máximo 5 min de atraso para o resto.
 */
const VENUE_EVENTS_CACHE = { tags: ["agenda"], revalidate: 300 };

/**
 * Próximos eventos de um lugar do Guia ("Próximos eventos aqui"): o mesmo recorte da agenda
 * pública (`eventsQuery`: ainda não terminou; RLS: confirmado e não retirado), por início.
 */
export async function upcomingEventsAtVenue(
  venueId: string,
  limit: number = VENUE_EVENTS_LIMIT,
): Promise<Result<EventView[], QueryError>> {
  return readPublic((db) => fetchEvents(db, { venueId, limit }), VENUE_EVENTS_CACHE);
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
    return row ? (await toEventViews(db, [row]))[0]! : null;
  });
}
