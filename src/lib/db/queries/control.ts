import "server-only";
import {
  AGENT_STEPS,
  deriveRunState,
  isStepName,
  looksLikeIp,
  maskIpsFor,
  maskJson,
  sourceHealthState,
} from "@/lib/control/monitor";
import type {
  EventRow,
  LiveSnapshot,
  OverviewNumbers,
  QuarantineRow,
  QueueRow,
  RetryRow,
  RunRow,
  SourceHealthRow,
} from "@/lib/control/types";
import type { DbClient } from "@/lib/db/client";
import { LATE_AFTER_MIN } from "@/lib/pipeline/status";
import { studioContext } from "@/lib/studio/context";

/*
 * Leituras do Control Center (P5-T3), com a sessão da pessoa. As filas e agregados vêm de funções
 * SECURITY DEFINER (`control_*`, migration 0029) que exigem papel de métricas; eventos de
 * `pipeline_events` leem direto (RLS de equipe).
 */

/** Só administrador vê IP inteiro (Global Constraints do P5). */
async function viewer(): Promise<{ admin: boolean }> {
  const { session } = await studioContext();
  return { admin: session?.roles.some((r) => r.role === "admin") ?? false };
}

function must<T>(what: string, r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(`control ${what}: ${r.error.message}`);
  return (r.data ?? ([] as unknown)) as T;
}

type RunDb = {
  id: string;
  window_start: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  stats: unknown;
  events: number;
  errors: number;
  warns: number;
  last_event_at: string | null;
  pending: number;
  cost_brl: number | string | null;
};

const isDbStatus = (s: string): s is "running" | "ok" | "partial" | "failed" =>
  s === "running" || s === "ok" || s === "partial" || s === "failed";

function runRow(r: RunDb, now: Date): RunRow {
  const stats =
    typeof r.stats === "object" && r.stats !== null ? (r.stats as Record<string, unknown>) : {};
  const status = deriveRunState({
    dbStatus: isDbStatus(r.status) ? r.status : "running",
    pending: r.pending,
    errors: r.errors,
    events: r.events,
    lastEventAt: r.last_event_at,
    startedAt: r.started_at,
    now,
  });
  const end = Date.parse(r.last_event_at ?? r.started_at);
  return {
    id: r.id,
    windowStart: r.window_start,
    startedAt: r.started_at,
    status,
    manual: stats.manual === true,
    events: r.events,
    errors: r.errors,
    warns: r.warns,
    lastEventAt: r.last_event_at,
    pending: r.pending,
    costBrl: Number(r.cost_brl ?? 0),
    durationMs: Math.max(0, end - Date.parse(r.started_at)),
  };
}

export async function fetchRuns(
  db: DbClient,
  limit: number,
  now: Date,
  id?: string,
): Promise<RunRow[]> {
  const rows = must(
    "execuções",
    await db.rpc("control_runs", { p_limit: limit, ...(id ? { p_run: id } : {}) }),
  );
  return rows.map((r) => runRow(r, now));
}

export async function fetchSources(db: DbClient, admin: boolean): Promise<SourceHealthRow[]> {
  const rows = must("fontes", await db.rpc("control_source_health"));
  return rows.map((r) => {
    const status =
      (["active", "paused", "degraded", "blocked"] as const).find((s) => s === r.status) ??
      "active";
    return {
      slug: r.slug,
      name: r.name,
      kind: r.kind,
      status,
      frequencyMinutes: r.frequency_minutes,
      lastFetchedAt: r.last_fetched_at,
      lastError: r.last_error === null ? null : maskIpsFor(r.last_error, admin),
      fetchOk: r.fetch_ok,
      fetchTotal: r.fetch_total,
      consecutiveFailures: r.consecutive_failures,
      items24h: r.items_24h,
      state: sourceHealthState({ status, consecutiveFailures: r.consecutive_failures }),
    };
  });
}

export async function fetchQueues(db: DbClient): Promise<QueueRow[]> {
  const rows = must("filas", await db.rpc("control_queue_stats"));
  return rows.map((r) => ({
    queue: r.queue,
    step: r.step,
    total: r.total,
    ready: r.ready,
    retrying: r.retrying,
    oldestAt: r.oldest_at,
    maxReads: r.max_reads,
  }));
}

export async function fetchOverview(db: DbClient): Promise<OverviewNumbers> {
  const rows = must("visão geral", await db.rpc("control_overview"));
  const r = rows[0];
  return {
    events1h: r?.events_1h ?? 0,
    errors1h: r?.errors_1h ?? 0,
    security24h: r?.security_24h ?? 0,
    cost24hBrl: Number(r?.cost_24h_brl ?? 0),
    aiCalls24h: r?.ai_calls_24h ?? 0,
    aiFailed24h: r?.ai_failed_24h ?? 0,
  };
}

const eventCols = "id, at, run_id, step, item_ref, level, message, details";
type EventDb = {
  id: number;
  at: string;
  run_id: string | null;
  step: string;
  item_ref: string | null;
  level: string;
  message: string;
  details: unknown;
};
const LEVELS = ["info", "warn", "error", "security"] as const;
const eventRow = (e: EventDb, admin: boolean): EventRow => ({
  id: e.id,
  at: e.at,
  runId: e.run_id,
  step: e.step,
  itemRef: e.item_ref,
  level: LEVELS.find((l) => l === e.level) ?? "info",
  message: maskIpsFor(e.message, admin),
  details: maskJson(e.details, admin),
});

/** Retrato para visão geral, tempo real e o polling de 5 s. */
export async function liveSnapshot(now: Date = new Date()): Promise<LiveSnapshot> {
  const { db } = await studioContext();
  const { admin } = await viewer();
  const [runs, queues, numbers, quarantine, sources, events] = await Promise.all([
    fetchRuns(db, 1, now),
    fetchQueues(db),
    fetchOverview(db),
    db.rpc("control_quarantine", { p_limit: 1 }),
    fetchSources(db, admin),
    db.from("pipeline_events").select(eventCols).order("id", { ascending: false }).limit(30),
  ]);
  const lastRun = runs[0] ?? null;
  const steps = lastRun
    ? must("etapas", await db.rpc("control_run_steps", { p_run: lastRun.id })).map((r) => ({
        step: r.step,
        level: r.level,
        count: r.count,
        firstAt: r.first_at,
        lastAt: r.last_at,
      }))
    : [];
  const started = lastRun ? Date.parse(lastRun.startedAt) : Number.NaN;
  const ageMinutes = Number.isFinite(started)
    ? Math.floor((now.getTime() - started) / 60_000)
    : null;
  return {
    at: now.toISOString(),
    lastRun,
    steps,
    queues,
    pendingTotal: queues.reduce((n, q) => n + q.total, 0),
    late: ageMinutes === null || ageMinutes > LATE_AFTER_MIN,
    ageMinutes,
    numbers,
    quarantineOpen: Number(must("quarentena", quarantine)[0]?.total_open ?? 0),
    sources,
    events: must("eventos", events).map((e) => eventRow(e, admin)),
  };
}

export interface FailuresView {
  quarantine: QuarantineRow[];
  quarantineTotal: number;
  retrying: RetryRow[];
  sources: SourceHealthRow[];
}

export async function failuresView(): Promise<FailuresView> {
  const { db } = await studioContext();
  const { admin } = await viewer();
  const [q, r, sources] = await Promise.all([
    db.rpc("control_quarantine", { p_limit: 200 }),
    db.rpc("control_retrying_jobs", { p_limit: 200 }),
    fetchSources(db, admin),
  ]);
  const quarantine = must("quarentena", q);
  return {
    quarantine: quarantine.map((x) => ({
      id: x.id,
      queue: x.queue,
      step: x.step,
      itemRef: x.item_ref,
      runId: x.run_id,
      reads: x.read_ct,
      error: maskIpsFor(x.error, admin),
      at: x.quarantined_at,
    })),
    quarantineTotal: Number(quarantine[0]?.total_open ?? 0),
    retrying: must("tentativas", r).map((x) => ({
      id: x.id,
      queue: x.queue,
      step: x.step,
      itemRef: x.item_ref,
      reads: x.read_ct,
      error: maskIpsFor(x.last_error, admin),
      retryAt: x.visible_at,
    })),
    sources,
  };
}

export async function listRuns(limit = 50): Promise<RunRow[]> {
  const { db, now } = await studioContext();
  return fetchRuns(db, limit, now());
}

export interface RunDetail {
  run: RunRow;
  steps: Awaited<ReturnType<typeof runSteps>>;
  failures: EventRow[];
}

async function runSteps(db: DbClient, id: string) {
  return must("etapas", await db.rpc("control_run_steps", { p_run: id })).map((r) => ({
    step: r.step,
    level: r.level,
    count: r.count,
    firstAt: r.first_at,
    lastAt: r.last_at,
  }));
}

export async function runDetail(id: string): Promise<RunDetail | null> {
  const { db, now } = await studioContext();
  const { admin } = await viewer();
  const [runs, steps, failures] = await Promise.all([
    fetchRuns(db, 1, now(), id),
    runSteps(db, id),
    db
      .from("pipeline_events")
      .select(eventCols)
      .eq("run_id", id)
      .in("level", ["error", "security", "warn"])
      .order("id", { ascending: false })
      .limit(100),
  ]);
  const run = runs[0];
  if (!run) return null;
  return { run, steps, failures: must("falhas", failures).map((e) => eventRow(e, admin)) };
}

export interface LogFilters {
  run?: string;
  item?: string;
  source?: string;
  step?: string;
  level?: string;
  agent?: string;
  q?: string;
}

export const LOG_PAGE_SIZE = 50;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Escapa `%`, `_` e a vírgula/parêntese do filtro `or` do PostgREST. */
const like = (v: string): string => v.replace(/[%_\\]/g, (c) => `\\${c}`).replace(/[,()"]/g, " ");

export async function queryLogs(
  filters: LogFilters,
  page: number,
  size: number = LOG_PAGE_SIZE,
  ascending = false,
): Promise<{ rows: EventRow[]; hasMore: boolean }> {
  const { db } = await studioContext();
  const { admin } = await viewer();
  // Filtro por IP (oráculo): quem não é admin só vê o IP mascarado, então não pode filtrar por ele.
  if (!admin && [filters.q, filters.item, filters.source].some((v) => v && looksLikeIp(v)))
    return { rows: [], hasMore: false };
  let q = db.from("pipeline_events").select(eventCols).order("id", { ascending });
  if (filters.run && UUID.test(filters.run)) q = q.eq("run_id", filters.run);
  if (filters.item?.trim()) q = q.ilike("item_ref", `%${like(filters.item.trim())}%`);
  if (filters.source?.trim()) q = q.ilike("item_ref", `%${like(filters.source.trim())}%`);
  if (filters.step && isStepName(filters.step)) q = q.eq("step", filters.step);
  if (filters.level && (LEVELS as readonly string[]).includes(filters.level))
    q = q.eq("level", filters.level);
  if (filters.agent && AGENT_STEPS[filters.agent])
    q = q.in("step", [...AGENT_STEPS[filters.agent]!]);
  if (filters.q?.trim()) q = q.ilike("message", `%${like(filters.q.trim())}%`);
  const from = Math.max(0, page - 1) * size;
  const rows = must("logs", await q.range(from, from + size));
  return { rows: rows.slice(0, size).map((e) => eventRow(e, admin)), hasMore: rows.length > size };
}
