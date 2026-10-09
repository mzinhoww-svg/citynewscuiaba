import "server-only";
import { randomUUID } from "node:crypto";
import type { EventInput } from "@/lib/agenda/event-form";
import { LOCKABLE_COLUMNS } from "@/lib/agenda/merge";
import { matchVenue } from "@/lib/agenda/venue-match";
import { audit } from "@/lib/audit";
import type { AuditAction } from "@/lib/audit/actions";
import type { DbClient } from "@/lib/db/client";
import { eventSlug } from "@/lib/db/agenda-store";
import { dayStart } from "@/lib/format/date";
import { err, ok, type Result } from "@/lib/result";
import { studioContext } from "@/lib/studio/context";

/**
 * Eventos da Agenda no Estúdio (AGM-T7, spec 2026-10-08 §5.2): lista com filtros, cadastro,
 * edição, retirada e devolução. Tudo com o cliente da pessoa (RLS: escrita só da editoria
 * `agenda`). Toda edição acrescenta as colunas alteradas em `locked_fields` (a coleta não as
 * sobrescreve, `mergeForSave`) e toda escrita grava `updated_at` (sem trigger) e o `audit_log`
 * com o diff.
 */

export const STUDIO_EVENT_ORIGINS = ["official", "organizer", "reader", "newsroom"] as const;
export type StudioEventOrigin = (typeof STUDIO_EVENT_ORIGINS)[number];
export const STUDIO_EVENT_SITUATIONS = [
  "no_ar",
  "retirado",
  "encerrado",
  "sem_confirmacao",
] as const;
export type StudioEventSituation = (typeof STUDIO_EVENT_SITUATIONS)[number];

/** Origem na URL (pt-BR) ↔ valor do banco. */
export const ORIGIN_PARAM: Record<StudioEventOrigin, string> = {
  official: "oficial",
  organizer: "organizacao",
  reader: "leitor",
  newsroom: "redacao",
};

export interface StudioEventFilters {
  q: string | null;
  /** Dia local de Cuiabá (AAAA-MM-DD), inclusive. */
  from: string | null;
  to: string | null;
  /** Slug da fonte (`event_listings.source_id`). */
  source: string | null;
  origin: StudioEventOrigin | null;
  situacao: StudioEventSituation | null;
  page: number;
}

export const STUDIO_EVENTS_PAGE_SIZE = 50;

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function validDay(raw: string | null): string | null {
  if (!raw || !DAY.test(raw)) return null;
  const d = new Date(`${raw}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === raw ? raw : null;
}

/** Filtros da URL; valor inválido é ignorado. */
export function parseStudioEventFilters(sp: URLSearchParams): StudioEventFilters {
  const q = (sp.get("q") ?? "").trim().slice(0, 80);
  const source = sp.get("fonte");
  const originParam = sp.get("origem");
  const situacao = sp.get("situacao");
  const page = Number(sp.get("pagina"));
  return {
    q: q || null,
    from: validDay(sp.get("de")),
    to: validDay(sp.get("ate")),
    source: source && SLUG.test(source) && source.length <= 80 ? source : null,
    origin: STUDIO_EVENT_ORIGINS.find((o) => ORIGIN_PARAM[o] === originParam) ?? null,
    situacao: STUDIO_EVENT_SITUATIONS.find((s) => s === situacao) ?? null,
    page: Number.isInteger(page) && page > 1 ? Math.min(page, 1000) : 1,
  };
}

interface SituationFields {
  confirmed_at: string | null;
  withdrawn_at: string | null;
  starts_at: string;
  ends_at: string | null;
}

/** Retirado > sem confirmação > encerrado (fim, ou início sem fim, no passado) > no ar. */
export function situationOf(e: SituationFields, now: Date): StudioEventSituation {
  if (e.withdrawn_at) return "retirado";
  if (!e.confirmed_at) return "sem_confirmacao";
  const end = Date.parse(e.ends_at ?? e.starts_at);
  return end < now.getTime() ? "encerrado" : "no_ar";
}

export interface StudioEventRow {
  id: string;
  slug: string;
  title: string;
  startsAt: string;
  endsAt: string | null;
  venue: string;
  origin: StudioEventOrigin;
  /** Nome da fonte (cadastrada) ou o slug guardado; `null` sem fonte (redação, leitor). */
  source: string | null;
  situation: StudioEventSituation;
  lockedFields: string[];
  /** Fim do destaque quando ainda vale (`featured_until` ≥ agora); `null` sem destaque. */
  featuredUntil: string | null;
}

const originOf = (o: string): StudioEventOrigin =>
  STUDIO_EVENT_ORIGINS.find((x) => x === o) ?? "organizer";

/** Texto de busca seguro para o filtro `or` do PostgREST (sem vírgula, aspas nem curingas). */
function searchTerm(q: string): string {
  return q
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const LIST_COLUMNS =
  "id, slug, title, starts_at, ends_at, venue, origin, source_id, confirmed_at, withdrawn_at, locked_fields, featured_until, source:sources!event_listings_source_ref_fkey(name)";

const activeFeature = (until: string | null, now: Date): string | null =>
  until && Date.parse(until) >= now.getTime() ? until : null;

/** Lista do Estúdio: todos os eventos (retirados e sem confirmação inclusive), por data desc. */
export async function listStudioEvents(
  filters: StudioEventFilters,
  now: Date = new Date(),
): Promise<{ rows: StudioEventRow[]; total: number }> {
  const ctx = await studioContext();
  const at = `"${now.toISOString()}"`;
  let q = ctx.db.from("event_listings").select(LIST_COLUMNS, { count: "exact" });
  const term = filters.q ? searchTerm(filters.q) : "";
  if (term) q = q.or(`title.ilike."*${term}*",venue.ilike."*${term}*"`);
  if (filters.from) q = q.gte("starts_at", dayStart(filters.from).toISOString());
  if (filters.to)
    q = q.lt("starts_at", new Date(dayStart(filters.to).getTime() + 86_400_000).toISOString());
  if (filters.source) q = q.eq("source_id", filters.source);
  if (filters.origin) q = q.eq("origin", filters.origin);
  switch (filters.situacao) {
    case "retirado":
      q = q.not("withdrawn_at", "is", null);
      break;
    case "sem_confirmacao":
      q = q.is("withdrawn_at", null).is("confirmed_at", null);
      break;
    case "encerrado":
      q = q
        .is("withdrawn_at", null)
        .not("confirmed_at", "is", null)
        .or(`ends_at.lt.${at},and(ends_at.is.null,starts_at.lt.${at})`);
      break;
    case "no_ar":
      q = q
        .is("withdrawn_at", null)
        .not("confirmed_at", "is", null)
        .or(`ends_at.gte.${at},and(ends_at.is.null,starts_at.gte.${at})`);
      break;
    default:
      break;
  }
  const start = (filters.page - 1) * STUDIO_EVENTS_PAGE_SIZE;
  const { data, error, count } = await q
    .order("starts_at", { ascending: false })
    .order("id", { ascending: true })
    .range(start, start + STUDIO_EVENTS_PAGE_SIZE - 1);
  if (error) throw new Error(`eventos do Estúdio: ${error.message}`);
  return {
    total: count ?? 0,
    rows: (data ?? []).map((r) => ({
      id: r.id,
      slug: r.slug,
      title: r.title,
      startsAt: r.starts_at,
      endsAt: r.ends_at,
      venue: r.venue,
      origin: originOf(r.origin),
      source: r.source?.name ?? r.source_id ?? null,
      situation: situationOf(r, now),
      lockedFields: r.locked_fields,
      featuredUntil: activeFeature(r.featured_until, now),
    })),
  };
}

/** Fontes de eventos para o filtro (nome e slug, como `event_listings.source_id`). */
export async function listEventSourceOptions(): Promise<{ slug: string; name: string }[]> {
  const ctx = await studioContext();
  const { data, error } = await ctx.db
    .from("sources")
    .select("slug, name")
    .eq("kind", "events")
    .order("name", { ascending: true })
    .limit(200);
  if (error) throw new Error(`fontes de eventos: ${error.message}`);
  return data ?? [];
}

/** Colunas que a redação edita, como guardadas. */
export interface StoredStudioEvent {
  id: string;
  slug: string;
  title: string;
  starts_at: string;
  ends_at: string | null;
  venue: string;
  neighborhood: string | null;
  price_cents: number | null;
  price_unknown: boolean;
  category: string;
  age_rating: string;
  accessibility: string | null;
  source_url: string | null;
  description: string | null;
  organizer: string | null;
  venue_id: string | null;
  locked_fields: string[];
  withdrawn_at: string | null;
}

const STORED_COLUMNS =
  "id, slug, title, starts_at, ends_at, venue, neighborhood, price_cents, price_unknown, category, age_rating, accessibility, source_url, description, organizer, venue_id, locked_fields, withdrawn_at";

export interface StudioEventDetail extends StoredStudioEvent {
  origin: StudioEventOrigin;
  confirmed_at: string | null;
  source: string | null;
  featured_until: string | null;
  /** Nome do lugar do Guia ligado (`venue_id`), quando a pessoa o enxerga. */
  venue_name: string | null;
}

/** Evento para a tela de edição (retirado inclusive); `null` se não existe ou a RLS esconde. */
export async function getStudioEvent(id: string): Promise<StudioEventDetail | null> {
  const ctx = await studioContext();
  const { data, error } = await ctx.db
    .from("event_listings")
    .select(
      `${STORED_COLUMNS}, origin, confirmed_at, source_id, featured_until, source:sources!event_listings_source_ref_fkey(name), guide_venue:venues(name)`,
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`evento do Estúdio: ${error.message}`);
  if (!data) return null;
  const { source, source_id, origin, guide_venue, ...rest } = data;
  return {
    ...rest,
    origin: originOf(origin),
    source: source?.name ?? source_id ?? null,
    venue_name: guide_venue?.name ?? null,
  };
}

/** Lugar do Guia que o seletor do formulário oferece (`agenda_venue_candidates`). */
export interface VenueOption {
  id: string;
  name: string;
}

/**
 * Lugares ativos do Guia para o seletor "Local do Guia" (o mesmo conjunto do casamento
 * automático). `null` = a leitura falhou (o formulário mostra o erro e mantém o vínculo).
 */
export async function listVenueOptions(): Promise<VenueOption[] | null> {
  const ctx = await studioContext();
  const { data, error } = await ctx.db.rpc("agenda_venue_candidates");
  if (error) {
    console.error("evento da agenda (seletor de lugares)", {
      code: error.code,
      message: error.message,
    });
    return null;
  }
  return (data ?? [])
    .filter((v) => v.status === "active")
    .map((v) => ({ id: v.id, name: v.name }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

/** Coluna → valor do formulário (a ordem é a da tela). */
function columnsOf(i: EventInput) {
  return {
    title: i.title,
    starts_at: i.startsAt,
    ends_at: i.endsAt,
    venue: i.venue,
    neighborhood: i.neighborhood,
    price_cents: i.priceCents,
    price_unknown: i.priceUnknown,
    category: i.category,
    age_rating: i.ageRating,
    accessibility: i.accessibility,
    source_url: i.sourceUrl,
    description: i.description,
    organizer: i.organizer,
  };
}
type EditableColumn = keyof ReturnType<typeof columnsOf>;

const TIMESTAMP_COLUMNS = new Set<EditableColumn>(["starts_at", "ends_at"]);

function same(column: EditableColumn, a: unknown, b: unknown): boolean {
  // O campo do formulário (datetime-local) só tem minutos: segundos guardados não contam.
  if (TIMESTAMP_COLUMNS.has(column) && typeof a === "string" && typeof b === "string")
    return Math.floor(Date.parse(a) / 60_000) === Math.floor(Date.parse(b) / 60_000);
  // Espaços a mais no texto guardado (coleta) não contam como edição.
  const norm = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() || null : v);
  return (norm(a) ?? null) === (norm(b) ?? null);
}

/** Colunas que o formulário mudou em relação ao guardado (instantes comparados pelo valor). */
export function changedColumns(before: StoredStudioEvent, input: EventInput): EditableColumn[] {
  const next = columnsOf(input);
  return (Object.keys(next) as EditableColumn[]).filter((c) => !same(c, before[c], next[c]));
}

/** Travas depois da edição: as atuais mais as alteradas que a coleta escreve, sem repetir. */
export function lockedAfterEdit(current: readonly string[], changed: readonly string[]): string[] {
  const out = [...current];
  for (const c of changed) if (c in LOCKABLE_COLUMNS && !out.includes(c)) out.push(c);
  return out;
}

export interface EventActor {
  /** Cliente com a sessão da pessoa (RLS valendo). */
  db: DbClient;
  userId: string;
  now: Date;
}

/**
 * `forbidden`: a RLS ou o papel barrou; `conflict`: duplicidade (endereço do evento, 23505);
 * `invalid`: o banco recusou um valor (check, 23514/22xxx); `not_found`: não existe para a pessoa.
 */
export type EventWriteError = "not_found" | "forbidden" | "conflict" | "invalid";
export type EventWriteResult<T> = Result<T, EventWriteError>;

/** Registra o erro do PostgREST (código e mensagem) e o traduz para o domínio. */
function dbFailure(
  what: string,
  error: { code?: string; message?: string } | null,
): EventWriteError {
  console.error(`evento da agenda (${what})`, {
    code: error?.code ?? null,
    message: error?.message ?? "sem linha devolvida",
  });
  const code = error?.code ?? "";
  if (code === "23505") return "conflict";
  if (code === "23514" || code === "23503" || code.startsWith("22")) return "invalid";
  return "forbidden";
}

async function record(
  actor: EventActor,
  action: AuditAction,
  id: string,
  details: Record<string, unknown>,
) {
  await audit(actor.userId, action, `event:${id}`, details, actor.db);
}

/** Casamento automático: o lugar, nenhum (`null`) ou falha na leitura dos candidatos. */
type AutoVenue = { kind: "match"; id: string | null } | { kind: "error" };

/**
 * Lugar do Guia pelo texto do local (`matchVenue`) com o mesmo conjunto de candidatos da coleta
 * (`agenda_venue_candidates`: todos os lugares ativos, públicos ou não; só quem edita a Agenda).
 */
async function autoVenue(db: DbClient, venueText: string): Promise<AutoVenue> {
  const { data, error } = await db.rpc("agenda_venue_candidates");
  if (error) {
    console.error("evento da agenda (lugares do Guia)", {
      code: error.code,
      message: error.message,
    });
    return { kind: "error" };
  }
  return { kind: "match", id: matchVenue(venueText, data ?? []) };
}

/**
 * Cadastro da redação: `origin = 'newsroom'`, no ar na hora (`confirmed_at`), as colunas da coleta
 * travadas (`locked_fields`) e sem chave de duplicidade (a coleta compara pelo título, data e
 * local, `existing`). Lugar do Guia: a escolha da redação (travada) ou, sem escolha, o casamento
 * automático pelo local (sem trava em `venue_id`).
 */
export async function createEvent(
  input: EventInput,
  actor: EventActor,
): Promise<EventWriteResult<{ id: string; slug: string }>> {
  const id = randomUUID();
  const stamp = actor.now.toISOString();
  const slug = eventSlug({
    title: input.title,
    startsAt: input.startsAt,
    dedupeKey: `newsroom|${id}`,
  });
  const values = columnsOf(input);
  const explicit = input.venueId !== undefined;
  const auto = explicit ? null : await autoVenue(actor.db, input.venue);
  const venueId = explicit ? (input.venueId ?? null) : auto?.kind === "match" ? auto.id : null;
  const { error } = await actor.db.from("event_listings").insert({
    id,
    slug,
    ...values,
    venue_id: venueId,
    origin: "newsroom",
    confirmed_at: stamp,
    locked_fields: Object.keys(LOCKABLE_COLUMNS).filter((c) => explicit || c !== "venue_id"),
    updated_at: stamp,
  });
  if (error) return err(dbFailure("cadastro", error));
  await record(actor, "event.create", id, {
    after: { ...values, venue_id: venueId },
    ...(explicit ? {} : { venue_id_auto: true }),
  });
  return ok({ id, slug });
}

/**
 * Edição: grava só as colunas alteradas, acrescenta-as em `locked_fields` (as que a coleta
 * escreve) e audita o diff. Sem mudança, não grava nada. Lugar do Guia: escolha explícita conta
 * como edição e trava `venue_id` (mesmo igual ao atual); sem escolha e sem trava, o vínculo é
 * recalculado pelo local quando não há vínculo ou o local mudou (pode ficar nulo). "Automático
 * pelo local" (`venueAuto`) num vínculo travado destrava `venue_id` e refaz o casamento; falha na
 * leitura dos lugares não destrava nem muda o vínculo.
 */
export async function updateEvent(
  id: string,
  input: EventInput,
  actor: EventActor,
): Promise<EventWriteResult<{ id: string; slug: string; changed: string[] }>> {
  const { data: before, error: readError } = await actor.db
    .from("event_listings")
    .select(STORED_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (readError) return err(dbFailure("leitura", readError));
  if (!before) return err("not_found");
  const formChanged = changedColumns(before, input);
  const next = columnsOf(input);
  const venueLocked = before.locked_fields.includes("venue_id");
  const explicitVenue = input.venueId !== undefined ? (input.venueId ?? null) : undefined;
  // Escolha explícita sempre trava, mesmo igual ao vínculo automático atual.
  const venueChosen =
    explicitVenue !== undefined && (explicitVenue !== before.venue_id || !venueLocked);
  const changed: string[] = venueChosen ? [...formChanged, "venue_id"] : formChanged;
  // "Automático pelo local" num vínculo travado destrava `venue_id` e refaz o casamento.
  const unlockVenue = venueLocked && explicitVenue === undefined && input.venueAuto === true;
  // Sem escolha e sem trava, o vínculo é derivado do local: recalcula sem vínculo ou com o local
  // alterado (inclusive para nulo). Falha na leitura dos candidatos não mexe no vínculo (nem
  // destrava).
  const auto =
    explicitVenue === undefined &&
    (unlockVenue || (!venueLocked && (before.venue_id === null || formChanged.includes("venue"))))
      ? await autoVenue(actor.db, input.venue)
      : null;
  const unlocked = unlockVenue && auto?.kind === "match";
  const autoVenueId = auto?.kind === "match" && auto.id !== before.venue_id ? auto.id : undefined;
  if (changed.length === 0 && autoVenueId === undefined && !unlocked)
    return ok({ id, slug: before.slug, changed: [] });
  const locked = lockedAfterEdit(
    unlocked ? before.locked_fields.filter((f) => f !== "venue_id") : before.locked_fields,
    changed,
  );
  const patch: Record<string, unknown> = {};
  for (const c of formChanged) patch[c] = next[c];
  if (venueChosen) patch.venue_id = explicitVenue;
  else if (autoVenueId !== undefined) patch.venue_id = autoVenueId;
  const { data, error } = await actor.db
    .from("event_listings")
    .update({ ...patch, locked_fields: locked, updated_at: actor.now.toISOString() })
    .eq("id", id)
    .select("id, slug")
    .maybeSingle();
  if (error || !data) return err(dbFailure("edição", error));
  const diff: Record<string, { from: unknown; to: unknown }> = {};
  for (const c of formChanged) diff[c] = { from: before[c], to: next[c] };
  if (venueChosen) diff.venue_id = { from: before.venue_id, to: explicitVenue };
  await record(actor, "event.update", id, {
    changed,
    diff,
    locked_fields: locked,
    ...(autoVenueId !== undefined
      ? { venue_id_auto: { from: before.venue_id, to: autoVenueId } }
      : {}),
    ...(unlocked ? { venue_unlocked: true } : {}),
  });
  return ok({ id, slug: data.slug, changed });
}

async function setWithdrawn(
  id: string,
  withdraw: boolean,
  actor: EventActor,
): Promise<EventWriteResult<{ id: string; slug: string; changed: boolean }>> {
  const stamp = actor.now.toISOString();
  const base = actor.db
    .from("event_listings")
    .update({ withdrawn_at: withdraw ? stamp : null, updated_at: stamp })
    .eq("id", id);
  const filtered = withdraw ? base.is("withdrawn_at", null) : base.not("withdrawn_at", "is", null);
  const { data, error } = await filtered.select("id, slug").maybeSingle();
  if (error) return err(dbFailure(withdraw ? "retirada" : "devolução", error));
  if (!data) {
    // Já estava no estado pedido (clique repetido), não existe ou a RLS barrou a escrita.
    const { data: row } = await actor.db
      .from("event_listings")
      .select("id, slug, withdrawn_at")
      .eq("id", id)
      .maybeSingle();
    if (!row) return err("not_found");
    return (row.withdrawn_at !== null) === withdraw
      ? ok({ id, slug: row.slug, changed: false })
      : err("forbidden");
  }
  await record(actor, withdraw ? "event.withdraw" : "event.restore", id, {
    withdrawn_at: withdraw ? stamp : null,
  });
  return ok({ id, slug: data.slug, changed: true });
}

/** Retira do ar (`withdrawn_at`): some da agenda pública (RLS) e a coleta não o devolve. */
export function withdrawEvent(id: string, actor: EventActor) {
  return setWithdrawn(id, true, actor);
}

/** Devolve ao ar (limpa `withdrawn_at`). */
export function restoreEvent(id: string, actor: EventActor) {
  return setWithdrawn(id, false, actor);
}

/**
 * "Destacar até {data}" / "Tirar destaque" (B5): grava `featured_until` (fim do dia escolhido, ou
 * `null`) e audita `event.feature` com o valor anterior e o novo. A RLS (`event_listings_write`,
 * editoria `agenda`) barra quem não cuida da Agenda. Valor igual ao guardado não grava nada.
 */
export async function setEventFeatured(
  id: string,
  until: string | null,
  actor: EventActor,
): Promise<EventWriteResult<{ id: string; slug: string; changed: boolean }>> {
  const { data: before, error: readError } = await actor.db
    .from("event_listings")
    .select("id, slug, featured_until")
    .eq("id", id)
    .maybeSingle();
  if (readError) return err(dbFailure("leitura do destaque", readError));
  if (!before) return err("not_found");
  const same =
    before.featured_until === until ||
    (before.featured_until !== null &&
      until !== null &&
      Date.parse(before.featured_until) === Date.parse(until));
  if (same) return ok({ id, slug: before.slug, changed: false });
  const { data, error } = await actor.db
    .from("event_listings")
    .update({ featured_until: until, updated_at: actor.now.toISOString() })
    .eq("id", id)
    .select("id, slug")
    .maybeSingle();
  if (error || !data) return err(dbFailure("destaque", error));
  await record(actor, "event.feature", id, {
    featured_until: until,
    from: before.featured_until,
  });
  return ok({ id, slug: data.slug, changed: true });
}
