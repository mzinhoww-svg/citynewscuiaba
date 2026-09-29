import "server-only";
import { pendingApprovals, type PendingApproval } from "@/lib/approvals";
import type { DbClient } from "@/lib/db/client";
import { crawlDelayOf, readSourceSettings } from "@/lib/db/pipeline-store";
import { rowToConfig, type SourceRow } from "@/lib/db/source-admin-store";
import { err, ok, type Result } from "@/lib/result";
import { studioContext } from "@/lib/studio/context";
import {
  effectiveFrequency,
  healthLabel,
  laneOf,
  nextCollectionAt,
  operationalScore,
} from "@/lib/sources";
import type {
  ConsumptionStrategy,
  Reliability,
  SourceConfig,
  SourceStatus,
  StatusReason,
} from "@/lib/sources/types";
import type { QueryError } from "./types";

/*
 * Leituras do painel de fontes (FS-T6), com a sessão da pessoa (RLS de equipe). Nenhum campo de
 * corpo de matéria: só título, link e data. Frequência efetiva, via, próxima coleta e saúde são
 * derivadas aqui, com as funções puras de `src/lib/sources`.
 */

export const SOURCES_PAGE_SIZE = 25;
export const HISTORY_PAGE_SIZE = 20;

export type HealthState = "saudavel" | "atencao" | "critica" | "sem_dados";
export type SourceSort = "name" | "score" | "status" | "last" | "frequency";

export interface SourceFilters {
  q: string;
  status: SourceStatus[];
  layer: number[];
  category: string | null;
  locality: string | null;
  reliability: Reliability | null;
  /** Via de coleta pela frequência efetiva. */
  via: "rapida" | "normal" | null;
  health: HealthState | null;
  /** `no` (padrão) esconde arquivadas; `only` mostra só elas; `all` mostra tudo. */
  archived: "no" | "only" | "all";
  sort: SourceSort;
  dir: "asc" | "desc";
  page: number;
}

const STATUSES: readonly SourceStatus[] = ["active", "paused", "degraded", "blocked"];
const RELIABILITIES: readonly Reliability[] = ["primary", "verified", "standard", "low"];
const HEALTHS: readonly HealthState[] = ["saudavel", "atencao", "critica", "sem_dados"];
const SORTS: readonly SourceSort[] = ["name", "score", "status", "last", "frequency"];
const LOCALITIES = ["cuiaba", "varzea-grande", "mt", "nacional"];

const SLUG = /^[a-z0-9][a-z0-9-]{0,59}$/;

/** Filtros do endereço; valor inválido é ignorado (nunca lança). */
export function parseSourceFilters(sp: URLSearchParams): SourceFilters {
  const list = (key: string) =>
    sp
      .getAll(key)
      .flatMap((v) => v.split(","))
      .map((v) => v.trim())
      .filter(Boolean);
  const one = <T extends string>(key: string, allowed: readonly T[]): T | null => {
    const v = sp.get(key);
    return v !== null && (allowed as readonly string[]).includes(v) ? (v as T) : null;
  };
  const page = Number(sp.get("pagina"));
  const category = sp.get("editoria");
  return {
    q: (sp.get("q") ?? "").trim().slice(0, 80),
    status: list("status").filter((s): s is SourceStatus =>
      (STATUSES as readonly string[]).includes(s),
    ),
    layer: list("camada")
      .map(Number)
      .filter((n) => n === 1 || n === 2 || n === 3 || n === 4),
    category: category && SLUG.test(category) ? category : null,
    locality: one("localidade", LOCALITIES),
    reliability: one("confiabilidade", RELIABILITIES),
    via: one("via", ["rapida", "normal"] as const),
    health: one("saude", HEALTHS),
    archived: one("arquivadas", ["only", "all"] as const) ?? "no",
    sort: one("ordem", SORTS) ?? "name",
    dir: sp.get("dir") === "desc" ? "desc" : "asc",
    page: Number.isInteger(page) && page >= 1 && page <= 1000 ? page : 1,
  };
}

/** Frequência como o painel exibe: a escolhida, a efetiva e quem elevou (A-115). */
export interface FrequencyView {
  /** `null` = segue o padrão global. */
  chosen: number | null;
  effective: number;
  /** Robots ou termos empurraram a efetiva acima da escolhida/padrão. */
  raisedBy: "robots" | "terms" | null;
  lane: "fast" | "normal";
  isDefault: boolean;
  defaultMinutes: number;
}

export interface SourceListRow {
  id: string;
  slug: string;
  name: string;
  displayName: string | null;
  baseUrl: string;
  status: SourceStatus;
  statusReason: StatusReason | null;
  archived: boolean;
  layer: number | null;
  editorialScore: number;
  reliability: Reliability;
  locality: string;
  categories: string[];
  frequency: FrequencyView;
  nextCollectionAt: string | null;
  lastFetchedAt: string | null;
  lastError: string | null;
  consecutiveFailures: number;
  operationalScore: number | null;
  health: HealthState;
  /** Falhas de coleta do dia (Cuiabá). */
  errors24h: number;
  pendingApproval: boolean;
  version: number;
}

const REASONS: readonly string[] = [
  "pending_activation",
  "manual",
  "auto_failures",
  "robots",
  "opt_out",
  "legal",
  "quality",
  "other",
];
const asReason = (v: string | null): StatusReason | null =>
  v !== null && REASONS.includes(v) ? (v as StatusReason) : null;

function frequencyView(
  row: Pick<SourceRow, "frequency_minutes" | "terms_min_interval_minutes" | "consumption">,
  defaultMinutes: number,
): FrequencyView {
  const eff = effectiveFrequency(row.frequency_minutes, defaultMinutes, {
    crawlDelaySec: crawlDelayOf(row.consumption),
    termsMinIntervalMinutes: row.terms_min_interval_minutes,
  });
  return {
    chosen: row.frequency_minutes,
    effective: eff.minutes,
    raisedBy: eff.raisedBy,
    lane: laneOf(eff.minutes),
    isDefault: row.frequency_minutes === null,
    defaultMinutes,
  };
}

const DAY = 86_400_000;
const cuiabaDay = (d: Date): string =>
  new Date(d.getTime() - 4 * 3_600_000).toISOString().slice(0, 10);

interface HealthDay {
  day: string;
  fetch_ok: number;
  fetch_not_modified: number;
  fetch_failed: number;
  items_new: number;
  latency_ms_sum: number;
  latency_samples: number;
  last_error: string | null;
}

function scoreOf(
  days: HealthDay[],
  now: Date,
  lastNewItemAt: string | null,
  expectedGapHours: number,
) {
  const today = cuiabaDay(now);
  const ok30 = days.reduce((n, d) => n + d.fetch_ok + d.fetch_not_modified, 0);
  const failed30 = days.reduce((n, d) => n + d.fetch_failed, 0);
  const todayRow = days.find((d) => d.day === today);
  const ok24h = todayRow ? todayRow.fetch_ok + todayRow.fetch_not_modified : 0;
  const failed24h = todayRow?.fetch_failed ?? 0;
  const hours = lastNewItemAt
    ? Math.max(0, (now.getTime() - Date.parse(lastNewItemAt)) / 3_600_000)
    : null;
  const input = {
    ok30,
    failed30,
    ok24h,
    failed24h,
    hoursSinceNewItem: hours,
    expectedGapHours,
  };
  const score = operationalScore(input);
  return { ...input, score, label: healthLabel(score) };
}

/** Intervalo esperado entre itens novos, em horas: cadência medida ou a frequência efetiva. */
function expectedGapHours(row: SourceRow, effectiveMinutes: number): number {
  const c = row.consumption;
  const gap =
    typeof c === "object" && c !== null && !Array.isArray(c)
      ? (c as { cadence?: { medianGapMinutes?: number | null } }).cadence?.medianGapMinutes
      : null;
  return Math.max(1, (typeof gap === "number" && gap > 0 ? gap : effectiveMinutes) / 60);
}

async function healthDays(
  db: DbClient,
  ids: string[],
  now: Date,
): Promise<Map<string, HealthDay[]>> {
  const out = new Map<string, HealthDay[]>();
  if (ids.length === 0) return out;
  const since = cuiabaDay(new Date(now.getTime() - 30 * DAY));
  const { data, error } = await db
    .from("source_health_daily")
    .select(
      "source_id, day, fetch_ok, fetch_not_modified, fetch_failed, items_new, latency_ms_sum, latency_samples, last_error",
    )
    .in("source_id", ids)
    .gte("day", since);
  if (error) throw new Error(`fontes (saúde): ${error.message}`);
  for (const r of data ?? []) {
    const list = out.get(r.source_id) ?? [];
    list.push({ ...r, latency_ms_sum: Number(r.latency_ms_sum) });
    out.set(r.source_id, list);
  }
  return out;
}

/** Último item novo (data de criação da linha) por fonte, nos últimos 30 dias. */
async function lastNewItems(db: DbClient, ids: string[], now: Date): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (ids.length === 0) return out;
  const since = new Date(now.getTime() - 30 * DAY).toISOString();
  const { data, error } = await db
    .from("collected_items")
    .select("source_id, created_at")
    .in("source_id", ids)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(2000);
  if (error) throw new Error(`fontes (itens): ${error.message}`);
  for (const r of data ?? []) if (!out.has(r.source_id)) out.set(r.source_id, r.created_at);
  return out;
}

const unavailable = (e: unknown): QueryError => ({
  kind: "unavailable",
  message: e instanceof Error ? e.message : String(e),
});

const cmp = (a: string | number | null, b: string | number | null): number => {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a < b ? -1 : 1;
};

/**
 * Lista de fontes com filtros, ordenação e página de 25. Carrega as fontes que passam pelos
 * filtros simples e deriva o resto (via, saúde) em memória: o cadastro tem dezenas de linhas.
 */
export async function listSources(
  f: SourceFilters,
  now: Date = new Date(),
): Promise<Result<{ rows: SourceListRow[]; total: number }, QueryError>> {
  try {
    const { db } = await studioContext();
    let q = db.from("sources").select("*");
    if (f.archived === "no") q = q.is("archived_at", null);
    if (f.archived === "only") q = q.not("archived_at", "is", null);
    if (f.status.length > 0) q = q.in("status", f.status);
    if (f.layer.length > 0) q = q.in("layer", f.layer);
    if (f.category) q = q.contains("categories", [f.category]);
    if (f.locality) q = q.eq("locality", f.locality);
    if (f.reliability) q = q.eq("reliability", f.reliability);
    if (f.q) {
      const t = f.q.replace(/[%_,()\\]/g, " ").trim();
      if (t) q = q.or(`name.ilike.%${t}%,slug.ilike.%${t}%,display_name.ilike.%${t}%`);
    }
    const [{ data, error }, settings, pending] = await Promise.all([
      q.limit(1000),
      readSourceSettings(db),
      pendingApprovals("source:"),
    ]);
    if (error) throw new Error(`fontes: ${error.message}`);
    const rows = data ?? [];
    const ids = rows.map((r) => r.id);
    const [days, latest] = await Promise.all([
      healthDays(db, ids, now),
      lastNewItems(db, ids, now),
    ]);
    const pendingIds = new Set(pending.flatMap((p) => sourceIdOf(p.targetRef) ?? []));

    const view = rows.map((r): SourceListRow => {
      const freq = frequencyView(r, settings.defaultFrequency);
      const h = scoreOf(
        days.get(r.id) ?? [],
        now,
        latest.get(r.id) ?? null,
        expectedGapHours(r, freq.effective),
      );
      const next = nextCollectionAt(
        { status: r.status, lastFetchedAt: r.last_fetched_at, frequencyMinutes: freq.effective },
        now,
      );
      return {
        id: r.id,
        slug: r.slug,
        name: r.name,
        displayName: r.display_name,
        baseUrl: r.base_url,
        status: r.status,
        statusReason: asReason(r.status_reason),
        archived: r.archived_at !== null,
        layer: r.layer,
        editorialScore: r.editorial_score,
        reliability: r.reliability,
        locality: r.locality,
        categories: r.categories,
        frequency: freq,
        nextCollectionAt: next ? next.toISOString() : null,
        lastFetchedAt: r.last_fetched_at,
        lastError: r.last_error,
        consecutiveFailures: r.consecutive_failures,
        operationalScore: h.score,
        health: h.label,
        errors24h: h.failed24h,
        pendingApproval: pendingIds.has(r.id),
        version: r.version,
      };
    });

    const filtered = view.filter(
      (s) =>
        (f.via === null || (f.via === "rapida") === (s.frequency.lane === "fast")) &&
        (f.health === null || s.health === f.health),
    );
    const dir = f.dir === "desc" ? -1 : 1;
    filtered.sort((a, b) => {
      const by =
        f.sort === "score"
          ? cmp(a.operationalScore, b.operationalScore)
          : f.sort === "status"
            ? cmp(a.status, b.status)
            : f.sort === "last"
              ? cmp(a.lastFetchedAt, b.lastFetchedAt)
              : f.sort === "frequency"
                ? cmp(a.frequency.effective, b.frequency.effective)
                : cmp(a.name.toLocaleLowerCase("pt-BR"), b.name.toLocaleLowerCase("pt-BR"));
      return by * dir || cmp(a.slug, b.slug);
    });
    const start = (f.page - 1) * SOURCES_PAGE_SIZE;
    return ok({ rows: filtered.slice(start, start + SOURCES_PAGE_SIZE), total: filtered.length });
  } catch (e) {
    return err(unavailable(e));
  }
}

/** `source:<uuid>:<campo>=<valor>` → uuid da fonte. */
export function sourceIdOf(targetRef: string): string | null {
  const m = /^source:([0-9a-f-]{36}):/i.exec(targetRef);
  return m?.[1] ?? null;
}

export interface SourceDetail {
  id: string;
  slug: string;
  version: number;
  baseUrl: string;
  feedUrl: string | null;
  kind: SourceRow["kind"];
  config: SourceConfig;
  status: SourceStatus;
  statusReason: StatusReason | null;
  statusChangedAt: string;
  archived: boolean;
  archivedAt: string | null;
  archiveReason: string | null;
  consecutiveFailures: number;
  lastFetchedAt: string | null;
  lastError: string | null;
  logoPath: string | null;
  strategy: ConsumptionStrategy | null;
  pageSelectors: { item: string; link: string; title: string; date?: string } | null;
  crawlDelaySec: number | null;
  termsReviewedAt: string | null;
  termsReviewedBy: string | null;
  frequency: FrequencyView;
  nextCollectionAt: string | null;
  updatedAt: string;
  createdAt: string;
  /** Pedidos pendentes de segunda aprovação desta fonte. */
  pendingApprovals: PendingApproval[];
}

const STRATEGIES: readonly string[] = [
  "rss",
  "atom",
  "jsonfeed",
  "sitemap_news",
  "page_list",
  "page_article",
];

export async function sourceDetail(
  id: string,
  now: Date = new Date(),
): Promise<Result<SourceDetail | null, QueryError>> {
  try {
    const { db } = await studioContext();
    const { data, error } = await db.from("sources").select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(`fonte: ${error.message}`);
    if (!data) return ok(null);
    const [settings, pending] = await Promise.all([
      readSourceSettings(db),
      pendingApprovals(`source:${id}:`),
    ]);
    const freq = frequencyView(data, settings.defaultFrequency);
    const c = data.consumption;
    const cons = typeof c === "object" && c !== null && !Array.isArray(c) ? c : {};
    const strategy = (cons as { strategy?: unknown }).strategy;
    const page = (cons as { page?: SourceDetail["pageSelectors"] }).page ?? null;
    const next = nextCollectionAt(
      {
        status: data.status,
        lastFetchedAt: data.last_fetched_at,
        frequencyMinutes: freq.effective,
      },
      now,
    );
    return ok({
      id: data.id,
      slug: data.slug,
      version: data.version,
      baseUrl: data.base_url,
      feedUrl: data.feed_url,
      kind: data.kind,
      config: rowToConfig(data),
      status: data.status,
      statusReason: asReason(data.status_reason),
      statusChangedAt: data.status_changed_at,
      archived: data.archived_at !== null,
      archivedAt: data.archived_at,
      archiveReason: data.archive_reason,
      consecutiveFailures: data.consecutive_failures,
      lastFetchedAt: data.last_fetched_at,
      lastError: data.last_error,
      logoPath: data.logo_path,
      strategy:
        typeof strategy === "string" && STRATEGIES.includes(strategy)
          ? (strategy as ConsumptionStrategy)
          : null,
      pageSelectors: page,
      crawlDelaySec: crawlDelayOf(data.consumption),
      termsReviewedAt: data.terms_reviewed_at,
      termsReviewedBy: data.terms_reviewed_by,
      frequency: freq,
      nextCollectionAt: next ? next.toISOString() : null,
      updatedAt: data.updated_at,
      createdAt: data.created_at,
      pendingApprovals: pending,
    });
  } catch (e) {
    return err(unavailable(e));
  }
}

export interface SourceHealth {
  days: {
    day: string;
    ok: number;
    notModified: number;
    failed: number;
    itemsNew: number;
    avgLatencyMs: number | null;
    lastError: string | null;
  }[];
  score: number | null;
  label: HealthState;
  ok30: number;
  failed30: number;
  ok24h: number;
  failed24h: number;
  hoursSinceNewItem: number | null;
}

/** Saúde operacional dos últimos `days` dias (até 90) e o score de 0 a 100. */
export async function sourceHealth(
  id: string,
  days = 30,
  now: Date = new Date(),
): Promise<Result<SourceHealth, QueryError>> {
  try {
    const { db } = await studioContext();
    const span = Math.min(90, Math.max(1, Math.floor(days)));
    const since = cuiabaDay(new Date(now.getTime() - span * DAY));
    const [{ data: src, error: se }, { data, error }, latest, settings] = await Promise.all([
      db.from("sources").select("*").eq("id", id).maybeSingle(),
      db
        .from("source_health_daily")
        .select(
          "source_id, day, fetch_ok, fetch_not_modified, fetch_failed, items_new, latency_ms_sum, latency_samples, last_error",
        )
        .eq("source_id", id)
        .gte("day", since)
        .order("day", { ascending: true }),
      lastNewItems(db, [id], now),
      readSourceSettings(db),
    ]);
    if (se) throw new Error(`fonte: ${se.message}`);
    if (error) throw new Error(`fontes (saúde): ${error.message}`);
    const rows: HealthDay[] = (data ?? []).map((r) => ({
      ...r,
      latency_ms_sum: Number(r.latency_ms_sum),
    }));
    const eff = src ? frequencyView(src, settings.defaultFrequency).effective : 30;
    const h = scoreOf(rows, now, latest.get(id) ?? null, src ? expectedGapHours(src, eff) : 1);
    return ok({
      days: rows.map((r) => ({
        day: r.day,
        ok: r.fetch_ok,
        notModified: r.fetch_not_modified,
        failed: r.fetch_failed,
        itemsNew: r.items_new,
        avgLatencyMs:
          r.latency_samples > 0 ? Math.round(r.latency_ms_sum / r.latency_samples) : null,
        lastError: r.last_error,
      })),
      score: h.score,
      label: h.label,
      ok30: h.ok30,
      failed30: h.failed30,
      ok24h: h.ok24h,
      failed24h: h.failed24h,
      hoursSinceNewItem: h.hoursSinceNewItem,
    });
  } catch (e) {
    return err(unavailable(e));
  }
}

export interface HistoryRow {
  id: number;
  at: string;
  actor: string;
  actorName: string | null;
  action: string;
  changes: { field: string; from: unknown; to: unknown }[];
  reason: string | null;
  batchId: string | null;
  approvalId: string | null;
}

const asObject = (v: unknown): Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

/** Histórico de auditoria da fonte (mais recente primeiro), 20 por página. */
export async function sourceHistory(
  id: string,
  page = 1,
): Promise<Result<{ rows: HistoryRow[]; total: number }, QueryError>> {
  try {
    const { db } = await studioContext();
    const from = (Math.max(1, Math.floor(page)) - 1) * HISTORY_PAGE_SIZE;
    const { data, error, count } = await db
      .from("audit_log")
      .select("id, at, actor, action, details", { count: "exact" })
      .eq("object_ref", `source:${id}`)
      .order("id", { ascending: false })
      .range(from, from + HISTORY_PAGE_SIZE - 1);
    if (error) throw new Error(`fonte (histórico): ${error.message}`);
    const rows = data ?? [];
    const actors = [...new Set(rows.map((r) => r.actor).filter((a) => /^[0-9a-f-]{36}$/i.test(a)))];
    const names = new Map<string, string>();
    if (actors.length > 0) {
      const p = await db.from("profiles").select("id, display_name").in("id", actors);
      for (const r of p.data ?? []) names.set(r.id, r.display_name);
    }
    return ok({
      total: count ?? rows.length,
      rows: rows.map((r): HistoryRow => {
        const d = asObject(r.details);
        const changes = Array.isArray(d.changes)
          ? d.changes.map((c) => {
              const o = asObject(c);
              return { field: String(o.field ?? ""), from: o.from ?? null, to: o.to ?? null };
            })
          : [];
        return {
          id: r.id,
          at: r.at,
          actor: r.actor,
          actorName: names.get(r.actor) ?? (r.actor === "sistema" ? "Sistema" : null),
          action: r.action,
          changes,
          reason: typeof d.reason === "string" ? d.reason : null,
          batchId: typeof d.batchId === "string" ? d.batchId : null,
          approvalId:
            typeof d.approvalId === "string"
              ? d.approvalId
              : d.approvalId !== undefined && d.approvalId !== null
                ? String(d.approvalId)
                : null,
        };
      }),
    });
  } catch (e) {
    return err(unavailable(e));
  }
}

export interface RecentItem {
  id: string;
  title: string;
  url: string;
  publishedAt: string | null;
  collectedAt: string;
}

/** Últimos itens coletados da fonte: só título, link e data (nunca corpo). */
export async function sourceRecentItems(
  id: string,
  limit = 10,
): Promise<Result<RecentItem[], QueryError>> {
  try {
    const { db } = await studioContext();
    const { data, error } = await db
      .from("collected_items")
      .select("id, original_title, canonical_url, published_at, created_at")
      .eq("source_id", id)
      .order("created_at", { ascending: false })
      .limit(Math.min(50, Math.max(1, limit)));
    if (error) throw new Error(`fonte (itens): ${error.message}`);
    return ok(
      (data ?? []).map((r) => ({
        id: r.id,
        title: r.original_title,
        url: r.canonical_url,
        publishedAt: r.published_at,
        collectedAt: r.created_at,
      })),
    );
  } catch (e) {
    return err(unavailable(e));
  }
}

export interface SourceRun {
  id: number;
  at: string;
  runId: string | null;
  level: "info" | "warn" | "error" | "security";
  message: string;
}

/** Últimas coletas da fonte (eventos da etapa `fetch`, mais recentes primeiro). */
export async function sourceRuns(id: string, limit = 20): Promise<Result<SourceRun[], QueryError>> {
  try {
    const { db } = await studioContext();
    const src = await db.from("sources").select("slug").eq("id", id).maybeSingle();
    if (src.error) throw new Error(`fonte: ${src.error.message}`);
    if (!src.data) return ok([]);
    const { data, error } = await db
      .from("pipeline_events")
      .select("id, at, run_id, level, message")
      .eq("step", "fetch")
      // Igual exato ou `source:<slug>:...`: o prefixo cru pegaria `source:<slug>-2`.
      .or(`item_ref.eq.source:${src.data.slug},item_ref.like.source:${src.data.slug}:%`)
      .order("at", { ascending: false })
      .limit(Math.min(100, Math.max(1, limit)));
    if (error) throw new Error(`fonte (coletas): ${error.message}`);
    return ok(
      (data ?? []).map((r) => ({
        id: r.id,
        at: r.at,
        runId: r.run_id,
        level:
          r.level === "warn" || r.level === "error" || r.level === "security" ? r.level : "info",
        message: r.message,
      })),
    );
  } catch (e) {
    return err(unavailable(e));
  }
}

export interface SourceApprovalRow extends PendingApproval {
  sourceId: string;
  sourceName: string | null;
  requesterName: string | null;
  field: string;
  value: string;
}

/** Pedidos `source.critical` pendentes (todas as fontes), do mais antigo ao mais novo. */
export async function pendingSourceApprovals(): Promise<Result<SourceApprovalRow[], QueryError>> {
  try {
    const { db } = await studioContext();
    const pending = (await pendingApprovals("source:")).filter((p) => p.kind === "source.critical");
    const sourceIds = [...new Set(pending.flatMap((p) => sourceIdOf(p.targetRef) ?? []))];
    const people = [...new Set(pending.map((p) => p.requestedBy))];
    const [sources, profiles] = await Promise.all([
      sourceIds.length > 0
        ? db.from("sources").select("id, name").in("id", sourceIds)
        : Promise.resolve({ data: [], error: null }),
      people.length > 0
        ? db.from("profiles").select("id, display_name").in("id", people)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (sources.error) throw new Error(`aprovações (fontes): ${sources.error.message}`);
    if (profiles.error) throw new Error(`aprovações (pessoas): ${profiles.error.message}`);
    const sName = new Map((sources.data ?? []).map((s) => [s.id, s.name]));
    const pName = new Map((profiles.data ?? []).map((p) => [p.id, p.display_name]));
    return ok(
      pending.flatMap((p) => {
        const m = /^source:([0-9a-f-]{36}):([a-z_]+)=(.+)$/i.exec(p.targetRef);
        if (!m?.[1] || !m[2] || !m[3]) return [];
        return [
          {
            ...p,
            sourceId: m[1],
            sourceName: sName.get(m[1]) ?? null,
            requesterName: pName.get(p.requestedBy) ?? null,
            field: m[2],
            value: m[3],
          },
        ];
      }),
    );
  } catch (e) {
    return err(unavailable(e));
  }
}
