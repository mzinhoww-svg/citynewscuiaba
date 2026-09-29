import "server-only";
import {
  computeAlerts,
  maskIpsDeep,
  phaseTimeline,
  runStatus,
  type ControlAlert,
  type PhaseSpan,
  type RunState,
  type StepStat,
} from "@/lib/control";
import { GLOBAL_DAILY_BUDGET_BRL } from "@/lib/ai/registry";
import type { DbClient } from "@/lib/db/client";
import type { Json } from "@/lib/db/types";
import { startOfDay } from "@/lib/format/date";
import { WINDOW_MINUTES, windowStart } from "@/lib/pipeline/window";
import { studioContext } from "@/lib/studio/context";

/*
 * Leituras do Control Center (O01, O02, O06, O07, O08) com a sessão da pessoa: RLS nas tabelas
 * e checagem de papel nas funções `control_*` (migration 0027). Uma leitura que a pessoa não
 * pode fazer (ex.: quarentena para `leitura`) volta vazia ou `null`, nunca com erro.
 */

function check(what: string, error: { message: string } | null): void {
  if (error) throw new Error(`control ${what}: ${error.message}`);
}

const num = (v: unknown): number => (typeof v === "number" ? v : Number(v ?? 0) || 0);

// ---------------------------------------------------------------------------
// Ciclos
// ---------------------------------------------------------------------------
export interface RunSummary {
  id: string;
  windowStart: string;
  startedAt: string;
  lastEventAt: string | null;
  manual: boolean;
  state: RunState;
  pending: number;
  quarantined: number;
  ok: number;
  retried: number;
  failed: number;
  events: number;
  /** Minutos entre o início e o último evento. */
  durationMin: number | null;
  costBrl: number;
  aiCalls: number;
  fetchEnqueued: number | null;
}

interface RunRow {
  id: string;
  window_start: string;
  started_at: string;
  status: string;
  stats: Json;
}

const statsOf = (s: Json): Record<string, Json | undefined> =>
  typeof s === "object" && s !== null && !Array.isArray(s) ? s : {};

async function stepStats(db: DbClient, ids: string[]): Promise<Map<string, StepStat[]>> {
  const out = new Map<string, StepStat[]>();
  if (ids.length === 0) return out;
  const { data, error } = await db.rpc("control_run_steps", { p_run_ids: ids });
  check("run_steps", error);
  for (const r of data ?? []) {
    const list = out.get(r.run_id) ?? [];
    list.push({
      step: r.step,
      ok: r.ok,
      warn: r.warn,
      error: r.error,
      security: r.security,
      firstAt: r.first_at,
      lastAt: r.last_at,
    });
    out.set(r.run_id, list);
  }
  return out;
}

async function runTotals(db: DbClient, ids: string[]) {
  const out = new Map<
    string,
    { pending: number; quarantined: number; cost: number; calls: number }
  >();
  if (ids.length === 0) return out;
  const { data, error } = await db.rpc("control_run_totals", { p_run_ids: ids });
  check("run_totals", error);
  for (const r of data ?? [])
    out.set(r.run_id, {
      pending: r.pending,
      quarantined: r.quarantined,
      cost: num(r.cost_brl),
      calls: r.ai_calls,
    });
  return out;
}

async function summarize(db: DbClient, rows: RunRow[]): Promise<RunSummary[]> {
  const ids = rows.map((r) => r.id);
  const [steps, totals] = await Promise.all([stepStats(db, ids), runTotals(db, ids)]);
  return rows.map((r) => {
    const s = steps.get(r.id) ?? [];
    const t = totals.get(r.id) ?? { pending: 0, quarantined: 0, cost: 0, calls: 0 };
    const sum = (k: "ok" | "warn" | "error" | "security") => s.reduce((a, x) => a + x[k], 0);
    const failed = sum("error") + sum("security");
    const events = sum("ok") + sum("warn") + failed;
    const last = s.length ? Math.max(...s.map((x) => Date.parse(x.lastAt))) : null;
    const stats = statsOf(r.stats);
    return {
      id: r.id,
      windowStart: r.window_start,
      startedAt: r.started_at,
      lastEventAt: last === null ? null : new Date(last).toISOString(),
      manual: stats.manual === true,
      state: runStatus({
        dbStatus: r.status,
        pending: t.pending,
        quarantined: t.quarantined,
        failed,
        events,
      }),
      pending: t.pending,
      quarantined: t.quarantined,
      ok: sum("ok"),
      retried: sum("warn"),
      failed,
      events,
      durationMin:
        last === null
          ? null
          : Math.round(Math.max(0, last - Date.parse(r.started_at)) / 6_000) / 10,
      costBrl: t.cost,
      aiCalls: t.calls,
      fetchEnqueued: typeof stats.fetch_enqueued === "number" ? stats.fetch_enqueued : null,
    };
  });
}

/** Execuções (O07): os ciclos mais recentes primeiro. */
export async function listRuns(limit = 30): Promise<RunSummary[]> {
  const { db } = await studioContext();
  const { data, error } = await db
    .from("ingest_runs")
    .select("id, window_start, started_at, status, stats")
    .order("started_at", { ascending: false })
    .limit(limit);
  check("runs", error);
  return summarize(db, data ?? []);
}

export interface RunEvent {
  id: number;
  at: string;
  step: string;
  itemRef: string | null;
  level: string;
  message: string;
}

export interface RunDetail {
  run: RunSummary;
  phases: PhaseSpan[];
  steps: StepStat[];
  failures: RunEvent[];
}

/** Detalhe do ciclo (O07): fases, itens por etapa e falhas. `null` = não existe. */
export async function runDetail(id: string, opts: { maskIp: boolean }): Promise<RunDetail | null> {
  const { db } = await studioContext();
  const { data, error } = await db
    .from("ingest_runs")
    .select("id, window_start, started_at, status, stats")
    .eq("id", id)
    .maybeSingle();
  check("run", error);
  if (!data) return null;
  const [run] = await summarize(db, [data]);
  const steps = (await stepStats(db, [id])).get(id) ?? [];
  const { data: ev, error: e2 } = await db
    .from("pipeline_events")
    .select("id, at, step, item_ref, level, message")
    .eq("run_id", id)
    .in("level", ["error", "security", "warn"])
    .order("id", { ascending: false })
    .limit(50);
  check("run_events", e2);
  const failures = (ev ?? []).map((e) => ({
    id: e.id,
    at: e.at,
    step: e.step,
    itemRef: e.item_ref,
    level: e.level,
    message: e.message,
  }));
  return {
    run: run!,
    phases: phaseTimeline(data.started_at, steps),
    steps,
    failures: opts.maskIp ? maskIpsDeep(failures) : failures,
  };
}

// ---------------------------------------------------------------------------
// Fila e saúde das fontes
// ---------------------------------------------------------------------------
export interface QueueStepRow {
  queue: string;
  step: string;
  ready: number;
  inFlight: number;
  retrying: number;
  oldestAt: string | null;
}

export interface SourceHealthRow {
  id: string;
  slug: string;
  name: string;
  kind: string;
  status: string;
  /** `sources.status_reason` (painel de fontes); `auto_failures` = pausa automática (R8). */
  statusReason: string | null;
  autoPaused: boolean;
  reliability: string;
  lastFetchedAt: string | null;
  lastError: string | null;
  ok30d: number;
  total30d: number;
  consecutiveFailures: number;
  errors24h: number;
  items24h: number;
}

export async function queueStats(db?: DbClient): Promise<QueueStepRow[]> {
  const client = db ?? (await studioContext()).db;
  const { data, error } = await client.rpc("control_queue_stats");
  check("queue_stats", error);
  return (data ?? []).map((r) => ({
    queue: r.queue,
    step: r.step,
    ready: r.ready,
    inFlight: r.in_flight,
    retrying: r.retrying,
    oldestAt: r.oldest_at,
  }));
}

export async function sourceHealth(db?: DbClient): Promise<SourceHealthRow[]> {
  const client = db ?? (await studioContext()).db;
  const { data, error } = await client.rpc("control_source_health");
  check("source_health", error);
  return (data ?? []).map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    kind: r.kind,
    status: r.status,
    statusReason: r.status_reason,
    autoPaused: r.status === "paused" && r.status_reason === "auto_failures",
    reliability: r.reliability,
    lastFetchedAt: r.last_fetched_at,
    lastError: r.last_error,
    ok30d: r.ok_30d,
    total30d: r.total_30d,
    consecutiveFailures: r.consecutive_failures,
    errors24h: r.errors_24h,
    items24h: r.items_24h,
  }));
}

// ---------------------------------------------------------------------------
// Visão geral (O01) e tempo real (O02)
// ---------------------------------------------------------------------------
export interface ControlNotification {
  id: number;
  createdAt: string;
  severity: string;
  title: string;
  body: string;
}

export interface LiveEvent extends RunEvent {
  runId: string | null;
}

export interface ControlSnapshot {
  at: string;
  lastRun: RunSummary | null;
  recentRuns: RunSummary[];
  nextWindowAt: string;
  queue: {
    total: number;
    ready: number;
    inFlight: number;
    retrying: number;
    steps: QueueStepRow[];
  };
  /** Quarentena aberta; `null` quando o papel não vê a quarentena. */
  quarantineOpen: number | null;
  events1h: { total: number; errors: number };
  /** Gasto de IA hoje (desde a meia-noite de Cuiabá); `null` quando o papel não vê custos. */
  spend: { todayBrl: number; budgetBrl: number } | null;
  alerts: ControlAlert[];
}

async function countEvents(db: DbClient, since: string, levels?: string[]): Promise<number> {
  let q = db.from("pipeline_events").select("id", { count: "exact", head: true }).gte("at", since);
  if (levels) q = q.in("level", levels);
  const { count, error } = await q;
  check("events_count", error);
  return count ?? 0;
}

async function spendToday(db: DbClient, now: Date): Promise<ControlSnapshot["spend"]> {
  const [calls, agents] = await Promise.all([
    db
      .from("ai_calls")
      .select("cost_brl")
      .gte("created_at", startOfDay(now).toISOString())
      .limit(20000),
    db.from("ai_agents").select("daily_budget_brl"),
  ]);
  check("ai_calls", calls.error);
  check("ai_agents", agents.error);
  const perAgent = (agents.data ?? []).reduce((s, a) => s + num(a.daily_budget_brl), 0);
  const today = (calls.data ?? []).reduce((s, c) => s + num(c.cost_brl), 0);
  return {
    todayBrl: Math.round(today * 100) / 100,
    budgetBrl: perAgent > 0 ? Math.min(GLOBAL_DAILY_BUDGET_BRL, perAgent) : GLOBAL_DAILY_BUDGET_BRL,
  };
}

/** Estado do Control Center (O01 e O02). */
export async function controlSnapshot(
  opts: { costs: boolean },
  now: Date = new Date(),
): Promise<ControlSnapshot> {
  const { db } = await studioContext();
  const [runsRes, steps, q, total1h, errors1h, spend, health] = await Promise.all([
    db
      .from("ingest_runs")
      .select("id, window_start, started_at, status, stats")
      .order("started_at", { ascending: false })
      .limit(12),
    queueStats(db),
    db
      .from("pipeline_quarantine")
      .select("id", { count: "exact", head: true })
      .is("resolved_at", null)
      .in("queue", ["pipeline", "media", "notify"]),
    countEvents(db, new Date(now.getTime() - 3_600_000).toISOString()),
    countEvents(db, new Date(now.getTime() - 3_600_000).toISOString(), ["error", "security"]),
    opts.costs ? spendToday(db, now) : Promise.resolve(null),
    sourceHealth(db),
  ]);
  check("runs", runsRes.error);
  const recentRuns = await summarize(db, runsRes.data ?? []);
  const lastRun = recentRuns[0] ?? null;
  const queue = steps.reduce(
    (a, s) => ({
      total: a.total + s.ready + s.inFlight + s.retrying,
      ready: a.ready + s.ready,
      inFlight: a.inFlight + s.inFlight,
      retrying: a.retrying + s.retrying,
    }),
    { total: 0, ready: 0, inFlight: 0, retrying: 0 },
  );
  const tickAgeMin = lastRun
    ? Math.floor((now.getTime() - Date.parse(lastRun.startedAt)) / 60_000)
    : null;
  return {
    at: now.toISOString(),
    lastRun,
    recentRuns,
    nextWindowAt: new Date(windowStart(now).getTime() + WINDOW_MINUTES * 60_000).toISOString(),
    queue: { ...queue, steps },
    quarantineOpen: q.error ? null : (q.count ?? 0),
    events1h: { total: total1h, errors: errors1h },
    spend,
    alerts: computeAlerts({
      tickAgeMin,
      queueTotal: queue.total,
      errors1h,
      events1h: total1h,
      spendBrl: spend?.todayBrl ?? 0,
      budgetBrl: spend?.budgetBrl ?? GLOBAL_DAILY_BUDGET_BRL,
      autoPaused: health.filter((h) => h.autoPaused).map((h) => h.name),
    }),
  };
}

/** Avisos abertos do pipeline para o Control Center (tabela `notifications`). */
export async function openNotifications(limit = 5): Promise<ControlNotification[]> {
  const { db } = await studioContext();
  const { data, error } = await db
    .from("notifications")
    .select("id, created_at, severity, title, body")
    .eq("channel", "control_center")
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(limit);
  check("notifications", error);
  return (data ?? []).map((n) => ({
    id: n.id,
    createdAt: n.created_at,
    severity: n.severity,
    title: n.title,
    body: n.body,
  }));
}

/** Últimos eventos do pipeline (O02), do mais novo para o mais antigo. */
export async function recentEvents(limit: number, opts: { maskIp: boolean }): Promise<LiveEvent[]> {
  const { db } = await studioContext();
  const { data, error } = await db
    .from("pipeline_events")
    .select("id, at, run_id, step, item_ref, level, message")
    .order("id", { ascending: false })
    .limit(limit);
  check("events", error);
  const rows = (data ?? []).map((e) => ({
    id: e.id,
    at: e.at,
    runId: e.run_id,
    step: e.step,
    itemRef: e.item_ref,
    level: e.level,
    message: e.message,
  }));
  return opts.maskIp ? maskIpsDeep(rows) : rows;
}

// ---------------------------------------------------------------------------
// Falhas (O06)
// ---------------------------------------------------------------------------
export interface FailureRow {
  kind: "quarantine" | "retrying";
  id: number;
  queue: string;
  step: string;
  itemRef: string;
  runRef: string | null;
  attempts: number;
  error: string;
  at: string;
}

export async function listFailures(opts: { maskIp: boolean }): Promise<FailureRow[]> {
  const { db } = await studioContext();
  const [q, r] = await Promise.all([
    db
      .from("pipeline_quarantine")
      .select("id, queue, message, read_ct, error, quarantined_at")
      .is("resolved_at", null)
      .in("queue", ["pipeline", "media", "notify"])
      .order("quarantined_at", { ascending: false })
      .limit(200),
    db.rpc("control_retrying_jobs", { p_limit: 200 }),
  ]);
  check("quarantine", q.error);
  check("retrying", r.error);
  const field = (m: Json, k: string): string | null => {
    const o = statsOf(m)[k];
    return typeof o === "string" ? o : null;
  };
  const rows: FailureRow[] = [
    ...(q.data ?? []).map((x) => ({
      kind: "quarantine" as const,
      id: x.id,
      queue: x.queue,
      step: field(x.message, "step") ?? "?",
      itemRef: field(x.message, "itemRef") ?? "?",
      runRef: field(x.message, "runId"),
      attempts: x.read_ct,
      error: x.error,
      at: x.quarantined_at,
    })),
    ...(r.data ?? []).map((x) => ({
      kind: "retrying" as const,
      id: x.id,
      queue: x.queue,
      step: x.step ?? "?",
      itemRef: x.item_ref ?? "?",
      runRef: x.run_ref,
      attempts: x.read_ct,
      error: x.last_error ?? "",
      at: x.visible_at,
    })),
  ];
  return opts.maskIp ? maskIpsDeep(rows) : rows;
}

// ---------------------------------------------------------------------------
// Logs (O08)
// ---------------------------------------------------------------------------
export interface LogFilters {
  run?: string;
  item?: string;
  source?: string;
  steps?: string[];
  level?: string;
  q?: string;
  before?: number;
  since?: string;
  limit?: number;
}

export interface LogRow extends LiveEvent {
  details: Json;
}

export async function searchLogs(f: LogFilters, opts: { maskIp: boolean }): Promise<LogRow[]> {
  const { db } = await studioContext();
  const { data, error } = await db.rpc("control_logs", {
    ...(f.run ? { p_run: f.run } : {}),
    ...(f.item ? { p_item: f.item } : {}),
    ...(f.source ? { p_source: f.source } : {}),
    ...(f.steps?.length ? { p_steps: f.steps } : {}),
    ...(f.level ? { p_level: f.level } : {}),
    ...(f.q ? { p_q: f.q } : {}),
    ...(f.before ? { p_before: f.before } : {}),
    ...(f.since ? { p_since: f.since } : {}),
    p_limit: f.limit ?? 50,
  });
  check("logs", error);
  const rows = (data ?? []).map((e) => ({
    id: e.id,
    at: e.at,
    runId: e.run_id,
    step: e.step,
    itemRef: e.item_ref,
    level: e.level,
    message: e.message,
    details: e.details,
  }));
  return opts.maskIp ? maskIpsDeep(rows) : rows;
}

/** Fontes para o filtro dos logs e o "Executar agora" de uma fonte. */
export async function sourceOptions(): Promise<
  { id: string; slug: string; name: string; status: string }[]
> {
  const { db } = await studioContext();
  const { data, error } = await db.from("sources").select("id, slug, name, status").order("name");
  check("sources", error);
  return data ?? [];
}

// ---------------------------------------------------------------------------
// Tempo real (O02): estado enxuto para o polling de 5 s
// ---------------------------------------------------------------------------
export interface LiveSnapshot {
  at: string;
  run: { id: string; startedAt: string; state: RunState; pending: number; failed: number } | null;
  phases: PhaseSpan[];
  queue: QueueStepRow[];
  events: LiveEvent[];
}

export async function liveSnapshot(
  opts: { maskIp: boolean },
  now: Date = new Date(),
): Promise<LiveSnapshot> {
  const { db } = await studioContext();
  const [runs, queue, events] = await Promise.all([
    db
      .from("ingest_runs")
      .select("id, window_start, started_at, status, stats")
      .order("started_at", { ascending: false })
      .limit(1),
    queueStats(db),
    recentEvents(20, opts),
  ]);
  check("live_run", runs.error);
  const row = runs.data?.[0];
  let run: LiveSnapshot["run"] = null;
  let phases: PhaseSpan[] = [];
  if (row) {
    const [summary] = await summarize(db, [row]);
    const steps = (await stepStats(db, [row.id])).get(row.id) ?? [];
    phases = phaseTimeline(row.started_at, steps);
    if (summary)
      run = {
        id: summary.id,
        startedAt: summary.startedAt,
        state: summary.state,
        pending: summary.pending,
        failed: summary.failed,
      };
  }
  return { at: now.toISOString(), run, phases, queue, events };
}
