import "server-only";
import { canAccess } from "@/lib/auth";
import { getSession } from "@/lib/auth/require-role";
import { createServerClient, createServiceClient, type DbClient } from "@/lib/db/client";
import type { Database, Json } from "@/lib/db/types";
import { SupabaseEnvError } from "@/lib/db/env";
import { err, ok, type Result } from "@/lib/result";
import {
  effectiveFrequency,
  healthLabel,
  laneOf,
  nextCollectionAt,
  operationalScore,
  type ConsumptionStrategy,
  type EffectiveFrequency,
  type FieldChange,
  type HealthLabel,
  type Locality,
  type PageSelectors,
  type SourceConfig,
  type SourceLayer,
  type SourceStatus,
  type StatusReason,
} from "@/lib/sources";
import type { DisplayStatus } from "@/content/pt-BR/sources-admin";
import { many } from "./run";
import type { QueryError } from "./types";
import { fold } from "@/lib/text/fold";
import { TIME_ZONE } from "@/lib/format/date";

/**
 * Leituras do painel de fontes (O03/O04, spec §8). Só para `source.manage`: cada leitura confere
 * a sessão (defesa em profundidade além do layout) e usa o cliente com a sessão da pessoa (RLS);
 * tabelas do pipeline sem política para `authenticated` (`source_item_stats`,
 * `source_fetch_outcomes`, `ingest_runs`, `collected_items`) são lidas com service role depois
 * dessa checagem. Todas devolvem `Result` e nunca lançam.
 */

type SourceRow = Database["public"]["Tables"]["sources"]["Row"];

export const SOURCES_PAGE_SIZE = 50;
export const HISTORY_PAGE_SIZE = 50;

// ---------------------------------------------------------------------------
// Filtros (na URL; inválidos ignorados, A-037)
// ---------------------------------------------------------------------------

const DISPLAY_STATUSES: readonly DisplayStatus[] = [
  "active",
  "degraded",
  "paused",
  "auto_paused",
  "blocked",
  "archived",
];
const HEALTHS: readonly HealthLabel[] = ["saudavel", "atencao", "critica", "sem_dados"];
const LOCALITIES: readonly Locality[] = ["cuiaba", "varzea-grande", "mt", "nacional"];
const SORTS = ["score", "health", "last", "name"] as const;
export type SourceSort = (typeof SORTS)[number];

export interface SourceFilters {
  q: string | null;
  status: DisplayStatus | null;
  layer: SourceLayer | null;
  locality: Locality | null;
  category: string | null;
  health: HealthLabel | null;
  via: "rapida" | "normal" | null;
  pending: boolean;
  sort: SourceSort;
  dir: "asc" | "desc";
  page: number;
}

const pick = <T extends string>(list: readonly T[], v: string | null): T | null =>
  v !== null && (list as readonly string[]).includes(v) ? (v as T) : null;

export function parseSourceFilters(sp: URLSearchParams): SourceFilters {
  const q = sp.get("q")?.trim().slice(0, 100) || null;
  const layerN = Number(sp.get("camada"));
  const page = Number(sp.get("pagina"));
  const category = sp.get("editoria")?.trim() ?? "";
  const sort = pick(SORTS, sp.get("ordem")) ?? "score";
  const dirRaw = sp.get("dir");
  return {
    q,
    status: pick(DISPLAY_STATUSES, sp.get("status")),
    layer: [1, 2, 3, 4].includes(layerN) ? (layerN as SourceLayer) : null,
    locality: pick(LOCALITIES, sp.get("localidade")),
    category: /^[a-z0-9-]{1,40}$/.test(category) ? category : null,
    health: pick(HEALTHS, sp.get("saude")),
    via: pick(["rapida", "normal"] as const, sp.get("via")),
    pending: sp.get("pendente") === "1",
    sort,
    dir: dirRaw === "asc" || dirRaw === "desc" ? dirRaw : sort === "name" ? "asc" : "desc",
    page: Number.isInteger(page) && page >= 1 && page <= 10_000 ? page : 1,
  };
}

// ---------------------------------------------------------------------------
// Tipos de leitura
// ---------------------------------------------------------------------------

export interface PendingSourceApproval {
  id: string;
  sourceId: string;
  sourceName: string;
  field: string;
  value: string;
  requestedBy: { id: string; name: string | null };
  justification: string;
  createdAt: string;
}

export interface SourceListRow {
  id: string;
  slug: string;
  name: string;
  domain: string;
  status: SourceStatus;
  statusReason: StatusReason | null;
  displayStatus: DisplayStatus;
  archived: boolean;
  layer: SourceLayer | null;
  locality: string;
  categories: string[];
  editorialScore: number;
  priority: 1 | 2 | 3;
  /** Frequência escolhida; `null` = segue o padrão global. */
  frequencyMinutes: number | null;
  effective: EffectiveFrequency;
  lane: "fast" | "normal";
  lastFetchedAt: string | null;
  nextCollectionAt: string | null;
  operationalScore: number | null;
  health: HealthLabel;
  errors24h: number;
  pendingApprovals: number;
  termsReviewedAt: string | null;
  version: number;
}

export interface SourceListResult {
  rows: SourceListRow[];
  total: number;
  counts: Record<DisplayStatus, number>;
  fastLane: { max: number; used: number; paused: number };
  defaultFrequency: number;
  pendingTotal: number;
}

export interface SourceDetail {
  id: string;
  slug: string;
  config: SourceConfig;
  kind: SourceRow["kind"];
  status: SourceStatus;
  statusReason: StatusReason | null;
  displayStatus: DisplayStatus;
  statusChangedAt: string | null;
  statusChangedBy: { id: string; name: string | null } | null;
  archivedAt: string | null;
  archiveReason: string | null;
  consumption: Record<string, unknown>;
  lastFetchedAt: string | null;
  lastError: string | null;
  etag: string | null;
  lastModified: string | null;
  consecutiveFailures: number;
  termsReviewedAt: string | null;
  ownerId: string | null;
  logoPath: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  defaultFrequency: number;
  effective: EffectiveFrequency;
  lane: "fast" | "normal";
  nextCollectionAt: string | null;
  pendingApprovals: PendingSourceApproval[];
  fastLane: { max: number; used: number; paused: number };
}

export interface HealthDay {
  day: string;
  ok: number;
  notModified: number;
  failed: number;
  itemsNew: number;
  avgLatencyMs: number | null;
}

export interface SourceHealth {
  days: HealthDay[];
  score: number | null;
  label: HealthLabel;
  components: { availability30: number | null; errorRate24h: number | null; freshness: string };
  lastError: string | null;
  lastItemAt: string | null;
}

export interface HistoryRow {
  id: number;
  at: string;
  actor: { id: string | null; name: string };
  action: string;
  changes: FieldChange[];
  reason: string | null;
  batchId: string | null;
  approvalId: string | null;
  details: Record<string, unknown>;
  ipHash: string | null;
}

export interface RecentItem {
  id: string;
  title: string;
  url: string;
  publishedAt: string | null;
  collectedAt: string;
  state: "duplicate" | "quarantined" | "in_topic" | "collected";
  topicId: string | null;
}

export interface SourceRun {
  runId: string;
  trigger: "cron" | "manual" | "fast";
  startedAt: string;
  status: string;
  outcome: string;
}

// ---------------------------------------------------------------------------
// Puros
// ---------------------------------------------------------------------------

const cuiabaDay = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const DAY_MS = 86_400_000;

export function displayStatusOf(r: {
  status: SourceStatus;
  status_reason: string | null;
  archived_at: string | null;
}): DisplayStatus {
  if (r.archived_at) return "archived";
  if (r.status === "paused" && r.status_reason === "auto_failures") return "auto_paused";
  return r.status;
}

function strategyOf(row: Pick<SourceRow, "kind" | "consumption">): ConsumptionStrategy {
  const c = row.consumption as { strategy?: string } | null;
  const s = c?.strategy;
  if (
    s === "rss" ||
    s === "atom" ||
    s === "jsonfeed" ||
    s === "sitemap_news" ||
    s === "page_list" ||
    s === "page_article"
  )
    return s;
  if (row.kind === "sitemap") return "sitemap_news";
  if (row.kind === "api") return "jsonfeed";
  if (row.kind === "page") return "page_article";
  return "rss";
}

function selectorsOf(consumption: unknown): PageSelectors | null {
  const c = consumption as { pageSelectors?: unknown; page?: unknown } | null;
  const sel = (c?.pageSelectors ?? c?.page) as Partial<PageSelectors> | null | undefined;
  if (
    sel &&
    typeof sel.item === "string" &&
    typeof sel.link === "string" &&
    typeof sel.title === "string"
  )
    return {
      item: sel.item,
      link: sel.link,
      title: sel.title,
      ...(typeof sel.date === "string" ? { date: sel.date } : {}),
    };
  return null;
}

const crawlDelayOf = (consumption: unknown): number | null => {
  const d = (consumption as { robots?: { crawlDelaySec?: unknown } } | null)?.robots?.crawlDelaySec;
  return typeof d === "number" ? d : null;
};

const asLayer = (n: number | null): SourceLayer | null =>
  n === 1 || n === 2 || n === 3 || n === 4 ? n : null;
const asPriority = (n: number): 1 | 2 | 3 => (n === 1 || n === 3 ? n : 2);
const asLocality = (s: string): Locality =>
  (LOCALITIES as readonly string[]).includes(s) ? (s as Locality) : "mt";

/** Linha do banco → `SourceConfig` (formulário da §7.2). */
export function configFromRow(row: SourceRow): SourceConfig {
  return {
    name: row.name,
    displayName: row.display_name,
    slug: row.slug,
    layer: asLayer(row.layer),
    categories: row.categories,
    locality: asLocality(row.locality),
    reliability: row.reliability,
    imagePolicy: row.image_policy,
    republishPolicy: row.republish_policy,
    maySoleSource: row.may_be_sole_source,
    agreementUntil: row.agreement_until,
    agreementNote: row.agreement_note,
    termsUrl: row.terms_url,
    strategy: strategyOf(row),
    baseUrl: row.base_url,
    feedUrl: row.feed_url,
    pageSelectors: selectorsOf(row.consumption),
    frequencyMinutes: row.frequency_minutes,
    rateLimitPerHour: row.rate_limit_per_hour,
    termsMinIntervalMinutes: row.terms_min_interval_minutes,
    editorialScore: row.editorial_score,
    priority: asPriority(row.priority),
    recPinned: row.rec_pinned,
    recLocalHighlight: row.rec_local_highlight,
    recExcluded: row.rec_excluded,
    trusted: row.trusted,
  };
}

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

interface HealthRow {
  day: string;
  source_id: string;
  fetch_ok: number;
  fetch_not_modified: number;
  fetch_failed: number;
  items_new: number;
  latency_ms_sum: number;
  latency_samples: number;
  last_error: string | null;
}

/**
 * Score operacional a partir de `source_health_daily`. "24 h" usa os buckets de hoje e ontem
 * (o registro é diário, fuso de Cuiabá): aproximação documentada, sempre ≥ 24 h de janela.
 */
export function healthOf(
  rows: HealthRow[],
  now: Date,
  lastItemAt: string | null,
  expectedGapHours: number,
): { score: number | null; label: HealthLabel; errors24h: number; ok24h: number } {
  const today = cuiabaDay.format(now);
  const yesterday = cuiabaDay.format(new Date(now.getTime() - DAY_MS));
  let ok30 = 0;
  let failed30 = 0;
  let ok24h = 0;
  let failed24h = 0;
  for (const r of rows) {
    ok30 += r.fetch_ok + r.fetch_not_modified;
    failed30 += r.fetch_failed;
    if (r.day === today || r.day === yesterday) {
      ok24h += r.fetch_ok + r.fetch_not_modified;
      failed24h += r.fetch_failed;
    }
  }
  const hoursSinceNewItem = lastItemAt
    ? Math.max(0, (now.getTime() - new Date(lastItemAt).getTime()) / 3_600_000)
    : null;
  const score = operationalScore({
    ok30,
    failed30,
    ok24h,
    failed24h,
    hoursSinceNewItem,
    expectedGapHours: Math.max(1, expectedGapHours),
  });
  return { score, label: healthLabel(score), errors24h: failed24h, ok24h };
}

function parseTarget(ref: string): { sourceId: string; field: string; value: string } | null {
  const m = /^source:([0-9a-f-]{36}):([a-z_]+)=(.*)$/i.exec(ref);
  return m ? { sourceId: m[1]!, field: m[2]!, value: m[3]! } : null;
}

export { parseTarget as parseSourceTarget };

const COMPARE: Record<SourceSort, (a: SourceListRow, b: SourceListRow) => number> = {
  score: (a, b) => a.editorialScore - b.editorialScore,
  health: (a, b) => (a.operationalScore ?? -1) - (b.operationalScore ?? -1),
  last: (a, b) => (a.lastFetchedAt ?? "").localeCompare(b.lastFetchedAt ?? ""),
  name: (a, b) => a.name.localeCompare(b.name, "pt-BR"),
};

/** Filtro, ordenação (desempate por nome) e página, sobre as linhas já montadas. */
export function filterAndSort(
  rows: SourceListRow[],
  f: SourceFilters,
): { rows: SourceListRow[]; total: number } {
  const q = f.q && fold(f.q);
  const filtered = rows.filter((r) => {
    if (f.status ? r.displayStatus !== f.status : r.archived) return false;
    if (q && !fold(r.name).includes(q) && !fold(r.domain).includes(q)) return false;
    if (f.layer && r.layer !== f.layer) return false;
    if (f.locality && r.locality !== f.locality) return false;
    if (f.category && !r.categories.includes(f.category)) return false;
    if (f.health && r.health !== f.health) return false;
    if (f.via === "rapida" && r.lane !== "fast") return false;
    if (f.via === "normal" && r.lane !== "normal") return false;
    if (f.pending && r.pendingApprovals === 0) return false;
    return true;
  });
  const sign = f.dir === "asc" ? 1 : -1;
  filtered.sort((a, b) => sign * COMPARE[f.sort](a, b) || COMPARE.name(a, b));
  const start = (f.page - 1) * SOURCES_PAGE_SIZE;
  return { rows: filtered.slice(start, start + SOURCES_PAGE_SIZE), total: filtered.length };
}

// ---------------------------------------------------------------------------
// Leituras
// ---------------------------------------------------------------------------

/** Um registro (`maybeSingle`): erro vira exceção de `readAdmin`. */
function single<R extends { data: unknown; error: { message: string } | null }>(res: R): R["data"] {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

interface Clients {
  db: DbClient;
  svc: () => DbClient;
  isAdmin: boolean;
}

async function readAdmin<T>(fn: (c: Clients) => Promise<T>): Promise<Result<T, QueryError>> {
  let db: DbClient;
  try {
    db = await createServerClient();
  } catch (e) {
    if (e instanceof SupabaseEnvError) return err({ kind: "unconfigured" });
    return err({ kind: "unavailable", message: e instanceof Error ? e.message : String(e) });
  }
  try {
    const session = await getSession();
    if (!session || !canAccess(session.roles, "source.manage"))
      return err({ kind: "unavailable", message: "sem permissão para gerenciar fontes" });
    const isAdmin = session.roles.some((r) => r.role === "admin");
    return ok(await fn({ db, svc: createServiceClient, isAdmin }));
  } catch (e) {
    return err({ kind: "unavailable", message: e instanceof Error ? e.message : String(e) });
  }
}

async function settingsOf(db: DbClient): Promise<{ defaultFrequency: number; fastMax: number }> {
  const rows = many(await db.from("app_settings").select("key, value"));
  const num = (key: string, fallback: number) => {
    const v = rows.find((r) => r.key === key)?.value;
    return typeof v === "number" ? v : fallback;
  };
  return {
    defaultFrequency: num("sources.default_frequency_minutes", 30),
    fastMax: num("sources.fast_lane_max", 10),
  };
}

async function namesOf(db: DbClient, ids: string[]): Promise<Map<string, string>> {
  const uuids = [...new Set(ids.filter((i) => /^[0-9a-f-]{36}$/i.test(i)))];
  if (uuids.length === 0) return new Map();
  const rows = many(await db.from("profiles").select("id, display_name").in("id", uuids));
  return new Map(rows.map((r) => [r.id, r.display_name]));
}

async function pendingRows(db: DbClient, sourceId?: string): Promise<PendingSourceApproval[]> {
  const rows = many(
    await db
      .from("approvals")
      .select("id, target_ref, requested_by, justification, created_at")
      .eq("kind", "source.critical")
      .eq("status", "pending")
      .like("target_ref", sourceId ? `source:${sourceId}:%` : "source:%")
      .order("created_at"),
  );
  const parsed = rows
    .map((r) => ({ r, t: parseTarget(r.target_ref) }))
    .filter(
      (x): x is { r: (typeof rows)[number]; t: NonNullable<ReturnType<typeof parseTarget>> } =>
        x.t !== null,
    );
  if (parsed.length === 0) return [];
  const sourceIds = [...new Set(parsed.map((x) => x.t.sourceId))];
  const sources = many(
    await db.from("sources").select("id, name, display_name").in("id", sourceIds),
  );
  const sourceName = new Map(sources.map((s) => [s.id, s.display_name ?? s.name]));
  const people = await namesOf(
    db,
    parsed.map((x) => x.r.requested_by),
  );
  return parsed.map(({ r, t }) => ({
    id: r.id,
    sourceId: t.sourceId,
    sourceName: sourceName.get(t.sourceId) ?? "",
    field: t.field,
    value: t.value,
    requestedBy: { id: r.requested_by, name: people.get(r.requested_by) ?? null },
    justification: r.justification,
    createdAt: r.created_at,
  }));
}

function expectedGapHours(row: SourceRow, effectiveMinutes: number): number {
  const gap = (row.consumption as { cadence?: { medianGapMinutes?: unknown } } | null)?.cadence
    ?.medianGapMinutes;
  return (
    (typeof gap === "number" && gap > 0 ? Math.max(gap, effectiveMinutes) : effectiveMinutes) / 60
  );
}

function toListRow(
  row: SourceRow,
  now: Date,
  defaultFrequency: number,
  health: HealthRow[],
  lastItemAt: string | null,
  pending: number,
): SourceListRow {
  const effective = effectiveFrequency(row.frequency_minutes, defaultFrequency, {
    crawlDelaySec: crawlDelayOf(row.consumption),
    termsMinIntervalMinutes: row.terms_min_interval_minutes,
  });
  const h = healthOf(health, now, lastItemAt, expectedGapHours(row, effective.minutes));
  const next = row.archived_at
    ? null
    : nextCollectionAt(
        {
          status: row.status,
          lastFetchedAt: row.last_fetched_at,
          frequencyMinutes: effective.minutes,
        },
        now,
      );
  return {
    id: row.id,
    slug: row.slug,
    name: row.display_name ?? row.name,
    domain: domainOf(row.base_url),
    status: row.status,
    statusReason: (row.status_reason as StatusReason | null) ?? null,
    displayStatus: displayStatusOf(row),
    archived: row.archived_at !== null,
    layer: asLayer(row.layer),
    locality: row.locality,
    categories: row.categories,
    editorialScore: row.editorial_score,
    priority: asPriority(row.priority),
    frequencyMinutes: row.frequency_minutes,
    effective,
    lane: laneOf(effective.minutes),
    lastFetchedAt: row.last_fetched_at,
    nextCollectionAt: next?.toISOString() ?? null,
    operationalScore: h.score,
    health: h.label,
    errors24h: h.errors24h,
    pendingApprovals: pending,
    termsReviewedAt: row.terms_reviewed_at,
    version: row.version,
  };
}

async function healthMap(
  c: Clients,
  now: Date,
  days: number,
  sourceId?: string,
): Promise<{ health: Map<string, HealthRow[]>; lastItem: Map<string, string | null> }> {
  const since = cuiabaDay.format(new Date(now.getTime() - days * DAY_MS));
  let hq = c.db.from("source_health_daily").select("*").gte("day", since);
  if (sourceId) hq = hq.eq("source_id", sourceId);
  const rows = many(await hq);
  const health = new Map<string, HealthRow[]>();
  for (const r of rows) health.set(r.source_id, [...(health.get(r.source_id) ?? []), r]);
  let sq = c.svc().from("source_item_stats").select("source_id, last_item_at");
  if (sourceId) sq = sq.eq("source_id", sourceId);
  const stats = many(await sq);
  return {
    health,
    lastItem: new Map(stats.map((s) => [s.source_id ?? "", s.last_item_at ?? null])),
  };
}

export async function listSources(
  f: SourceFilters,
  now: Date = new Date(),
): Promise<Result<SourceListResult, QueryError>> {
  return readAdmin(async (c) => {
    const [sources, settings, pending, hm] = await Promise.all([
      c.db.from("sources").select("*").then(many),
      settingsOf(c.db),
      pendingRows(c.db),
      healthMap(c, now, 30),
    ]);
    const pendingBySource = new Map<string, number>();
    for (const p of pending)
      pendingBySource.set(p.sourceId, (pendingBySource.get(p.sourceId) ?? 0) + 1);
    const all = sources.map((row) =>
      toListRow(
        row,
        now,
        settings.defaultFrequency,
        hm.health.get(row.id) ?? [],
        hm.lastItem.get(row.id) ?? null,
        pendingBySource.get(row.id) ?? 0,
      ),
    );
    const counts = Object.fromEntries(DISPLAY_STATUSES.map((s) => [s, 0])) as Record<
      DisplayStatus,
      number
    >;
    for (const r of all) counts[r.displayStatus]++;
    const fast = sources.filter(
      (s) => s.archived_at === null && s.frequency_minutes !== null && s.frequency_minutes < 30,
    );
    const page = filterAndSort(all, f);
    return {
      ...page,
      counts,
      fastLane: {
        max: settings.fastMax,
        used: fast.length,
        paused: fast.filter((s) => s.status !== "active" && s.status !== "degraded").length,
      },
      defaultFrequency: settings.defaultFrequency,
      pendingTotal: pending.length,
    };
  });
}

export async function sourceDetail(
  id: string,
  now: Date = new Date(),
): Promise<Result<SourceDetail | null, QueryError>> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return ok(null);
  return readAdmin(async (c) => {
    const row = single(await c.db.from("sources").select("*").eq("id", id).maybeSingle());
    if (!row) return null;
    const [settings, pending, fastRows] = await Promise.all([
      settingsOf(c.db),
      pendingRows(c.db, id),
      c.db
        .from("sources")
        .select("status")
        .is("archived_at", null)
        .lt("frequency_minutes", 30)
        .then(many),
    ]);
    const effective = effectiveFrequency(row.frequency_minutes, settings.defaultFrequency, {
      crawlDelaySec: crawlDelayOf(row.consumption),
      termsMinIntervalMinutes: row.terms_min_interval_minutes,
    });
    const names = await namesOf(c.db, row.status_changed_by ? [row.status_changed_by] : []);
    const next = row.archived_at
      ? null
      : nextCollectionAt(
          {
            status: row.status,
            lastFetchedAt: row.last_fetched_at,
            frequencyMinutes: effective.minutes,
          },
          now,
        );
    return {
      id: row.id,
      slug: row.slug,
      config: configFromRow(row),
      kind: row.kind,
      status: row.status,
      statusReason: (row.status_reason as StatusReason | null) ?? null,
      displayStatus: displayStatusOf(row),
      statusChangedAt: row.status_changed_at,
      statusChangedBy: row.status_changed_by
        ? { id: row.status_changed_by, name: names.get(row.status_changed_by) ?? null }
        : null,
      archivedAt: row.archived_at,
      archiveReason: row.archive_reason,
      consumption: (row.consumption as Record<string, unknown>) ?? {},
      lastFetchedAt: row.last_fetched_at,
      lastError: row.last_error,
      etag: row.etag,
      lastModified: row.last_modified,
      consecutiveFailures: row.consecutive_failures,
      termsReviewedAt: row.terms_reviewed_at,
      ownerId: row.owner_id,
      logoPath: row.logo_path,
      version: row.version,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      defaultFrequency: settings.defaultFrequency,
      effective,
      lane: laneOf(effective.minutes),
      nextCollectionAt: next?.toISOString() ?? null,
      pendingApprovals: pending,
      fastLane: {
        max: settings.fastMax,
        used: fastRows.length,
        paused: fastRows.filter((s) => s.status !== "active" && s.status !== "degraded").length,
      },
    };
  });
}

export async function sourceHealth(
  id: string,
  days = 30,
  now: Date = new Date(),
): Promise<Result<SourceHealth, QueryError>> {
  const span = Math.min(Math.max(Math.trunc(days) || 30, 1), 90);
  return readAdmin(async (c) => {
    const row = single(
      await c.db
        .from("sources")
        .select("frequency_minutes, consumption, terms_min_interval_minutes, last_error, kind")
        .eq("id", id)
        .maybeSingle(),
    );
    const settings = await settingsOf(c.db);
    const hm = await healthMap(c, now, span, id);
    const rows = hm.health.get(id) ?? [];
    const lastItemAt = hm.lastItem.get(id) ?? null;
    const effective = effectiveFrequency(
      row?.frequency_minutes ?? null,
      settings.defaultFrequency,
      {
        crawlDelaySec: crawlDelayOf(row?.consumption),
        termsMinIntervalMinutes: row?.terms_min_interval_minutes ?? null,
      },
    );
    const gapHours = effective.minutes / 60;
    const h = healthOf(rows, now, lastItemAt, gapHours);
    const byDay = new Map(rows.map((r) => [r.day, r]));
    const out: HealthDay[] = [];
    for (let i = span - 1; i >= 0; i--) {
      const day = cuiabaDay.format(new Date(now.getTime() - i * DAY_MS));
      const r = byDay.get(day);
      out.push({
        day,
        ok: r?.fetch_ok ?? 0,
        notModified: r?.fetch_not_modified ?? 0,
        failed: r?.fetch_failed ?? 0,
        itemsNew: r?.items_new ?? 0,
        avgLatencyMs:
          r && r.latency_samples > 0 ? Math.round(r.latency_ms_sum / r.latency_samples) : null,
      });
    }
    const total30 = out.reduce((s, d) => s + d.ok + d.notModified + d.failed, 0);
    const ok30 = out.reduce((s, d) => s + d.ok + d.notModified, 0);
    const total24 = h.errors24h + h.ok24h;
    const hours = lastItemAt ? (now.getTime() - new Date(lastItemAt).getTime()) / 3_600_000 : null;
    return {
      days: out,
      score: h.score,
      label: h.label,
      components: {
        availability30: total30 > 0 ? ok30 / total30 : null,
        errorRate24h: total24 > 0 ? h.errors24h / total24 : null,
        freshness:
          hours === null
            ? "sem_itens"
            : hours <= 2 * gapHours
              ? "em_dia"
              : hours <= 4 * gapHours
                ? "atrasada"
                : "parada",
      },
      lastError: row?.last_error ?? null,
      lastItemAt,
    };
  });
}

export async function sourceHistory(
  id: string,
  page = 1,
  action?: string,
): Promise<Result<{ rows: HistoryRow[]; total: number; page: number }, QueryError>> {
  const p = Number.isInteger(page) && page >= 1 ? page : 1;
  return readAdmin(async (c) => {
    let q = c.db
      .from("audit_log_view")
      .select("id, at, actor, action, details, ip_hash", { count: "exact" })
      .eq("object_ref", `source:${id}`);
    if (action && /^[a-z_.]{1,40}$/.test(action)) q = q.eq("action", action);
    const res = await q
      .order("id", { ascending: false })
      .range((p - 1) * HISTORY_PAGE_SIZE, p * HISTORY_PAGE_SIZE - 1)
      .returns<
        {
          id: number;
          at: string;
          actor: string;
          action: string;
          details: Json;
          ip_hash: string | null;
        }[]
      >();
    const rows = many(res);
    const names = await namesOf(
      c.db,
      rows.map((r) => r.actor),
    );
    return {
      rows: rows.map((r) => {
        const d = (r.details ?? {}) as Record<string, unknown>;
        const str = (v: unknown) => (typeof v === "string" && v ? v : null);
        return {
          id: r.id,
          at: r.at,
          actor: {
            id: /^[0-9a-f-]{36}$/i.test(r.actor) ? r.actor : null,
            name: names.get(r.actor) ?? (r.actor === "sistema" ? "Sistema" : r.actor),
          },
          action: r.action,
          changes: Array.isArray(d.changes) ? (d.changes as FieldChange[]) : [],
          reason: str(d.reason),
          batchId: str(d.batchId),
          approvalId: str(d.approvalId),
          details: d,
          // IP (hash) só para admin; as demais pessoas veem mascarado (spec §8, Histórico).
          ipHash: r.ip_hash ? (c.isAdmin ? r.ip_hash : `${r.ip_hash.slice(0, 4)}…`) : null,
        };
      }),
      total: res.count ?? rows.length,
      page: p,
    };
  });
}

export async function sourceRecentItems(id: string): Promise<Result<RecentItem[], QueryError>> {
  return readAdmin(async (c) => {
    const rows = many(
      await c
        .svc()
        .from("collected_items")
        .select(
          "id, original_title, canonical_url, published_at, created_at, duplicate_of, quarantined_at, topic_id",
        )
        .eq("source_id", id)
        .order("created_at", { ascending: false })
        .limit(50),
    );
    return rows.map((r) => ({
      id: r.id,
      title: r.original_title,
      url: r.canonical_url,
      publishedAt: r.published_at,
      collectedAt: r.created_at,
      state: r.duplicate_of
        ? "duplicate"
        : r.quarantined_at
          ? "quarantined"
          : r.topic_id
            ? "in_topic"
            : "collected",
      topicId: r.topic_id,
    }));
  });
}

/** Últimos 10 runs que tocaram a fonte: resultado final do `fetch`, runs manuais e puladas. */
export async function sourceRuns(id: string): Promise<Result<SourceRun[], QueryError>> {
  return readAdmin(async (c) => {
    const svc = c.svc();
    const source = single(await c.db.from("sources").select("slug").eq("id", id).maybeSingle());
    const outcomes = many(
      await svc
        .from("source_fetch_outcomes")
        .select("run_id, outcome, recorded_at")
        .eq("source_id", id)
        .order("recorded_at", { ascending: false })
        .limit(10),
    );
    const recent = many(
      await svc
        .from("ingest_runs")
        .select("id, trigger, started_at, status, stats")
        .order("started_at", { ascending: false })
        .limit(200),
    );
    const byId = new Map(recent.map((r) => [r.id, r]));
    const runs: SourceRun[] = [];
    const seen = new Set<string>();
    for (const o of outcomes) {
      const r = byId.get(o.run_id);
      seen.add(o.run_id);
      runs.push({
        runId: o.run_id,
        trigger: (r?.trigger as SourceRun["trigger"]) ?? "cron",
        startedAt: r?.started_at ?? o.recorded_at,
        status: r?.status ?? "ok",
        outcome: o.outcome,
      });
    }
    for (const r of recent) {
      if (seen.has(r.id)) continue;
      const stats = (r.stats ?? {}) as {
        source?: string;
        skipped?: { slug: string; reason: string }[];
      };
      const skip = stats.skipped?.find((s) => s.slug === source?.slug);
      if (skip)
        runs.push({
          runId: r.id,
          // Gatilho real do run que pulou a fonte (achado 10): ciclo, via rápida ou manual.
          trigger: r.trigger as SourceRun["trigger"],
          startedAt: r.started_at,
          status: r.status,
          outcome: `skipped:${skip.reason}`,
        });
      else if (r.trigger === "manual" && stats.source === id)
        runs.push({
          runId: r.id,
          trigger: "manual",
          startedAt: r.started_at,
          status: r.status,
          outcome: "pending",
        });
    }
    return runs.sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, 10);
  });
}

export async function pendingSourceApprovals(): Promise<
  Result<PendingSourceApproval[], QueryError>
> {
  return readAdmin((c) => pendingRows(c.db));
}

// ---------------------------------------------------------------------------
// Fontes puladas pela via rápida por falta de vaga (spec §8, aviso do cabeçalho O03)
// ---------------------------------------------------------------------------

export interface FastLaneSkip {
  slug: string;
  runId: string;
  /** `started_at` do run mais recente que pulou esta fonte por `fast_lane_full`. */
  at: string;
}

/**
 * De runs `fast` recentes, a fonte (uma linha por `slug`, a mais recente) pulada por
 * `fast_lane_full` — nunca `previous_pending` nem `rate_limited`, que não são falta de vaga.
 */
export function fastLaneFullSkips(
  runs: readonly { id: string; started_at: string; stats: unknown }[],
): FastLaneSkip[] {
  const bySlug = new Map<string, FastLaneSkip>();
  for (const r of runs) {
    const stats = (r.stats ?? {}) as { skipped?: { slug: string; reason: string }[] };
    for (const s of stats.skipped ?? []) {
      if (s.reason !== "fast_lane_full") continue;
      const prev = bySlug.get(s.slug);
      if (!prev || r.started_at > prev.at)
        bySlug.set(s.slug, { slug: s.slug, runId: r.id, at: r.started_at });
    }
  }
  return [...bySlug.values()];
}

export interface FastLaneSkippedSource {
  slug: string;
  name: string;
  at: string;
}

/** Fontes rápidas puladas por `fast_lane_full` nos últimos 30 min (spec §8, banner do cabeçalho). */
export async function fastLaneSkippedSources(
  now: Date = new Date(),
): Promise<Result<FastLaneSkippedSource[], QueryError>> {
  return readAdmin(async (c) => {
    const since = new Date(now.getTime() - 30 * 60_000).toISOString();
    const runs = many(
      await c
        .svc()
        .from("ingest_runs")
        .select("id, started_at, stats")
        .eq("trigger", "fast")
        .gte("started_at", since)
        .order("started_at", { ascending: false })
        .limit(20),
    );
    const skips = fastLaneFullSkips(runs);
    if (skips.length === 0) return [];
    const sources = many(
      await c.db
        .from("sources")
        .select("slug, name, display_name")
        .in(
          "slug",
          skips.map((s) => s.slug),
        ),
    );
    const nameOf = new Map(sources.map((s) => [s.slug, s.display_name ?? s.name]));
    return skips.map((s) => ({ slug: s.slug, name: nameOf.get(s.slug) ?? s.slug, at: s.at }));
  });
}
