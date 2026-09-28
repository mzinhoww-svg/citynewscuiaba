import type { DueSource, RunStore, RunTrigger, StartedRun } from "../ports";

/** Fonte de teste: só `slug` é obrigatório; o resto segue o padrão de uma fonte ativa comum. */
export type DueSourceInput = Partial<DueSource> & { slug: string };

export function dueSource(s: DueSourceInput): DueSource {
  return {
    id: `src-${s.slug}`,
    status: "active",
    priority: 2,
    editorialScore: 3,
    frequencyMinutes: null,
    crawlDelaySec: null,
    termsMinIntervalMinutes: null,
    rateLimitPerHour: 60,
    lastFetchedAt: null,
    ...s,
  };
}

export interface MemoryRunStoreOptions {
  sources?: DueSourceInput[];
  /** `app_settings.sources.default_frequency_minutes` (padrão 30). */
  defaultFrequency?: number;
  /** `app_settings.sources.fast_lane_max` (padrão 10). */
  fastLaneMax?: number;
}

interface MemoryRun {
  runId: string;
  trigger: RunTrigger;
  windowStart: string;
  open: boolean;
  fetchEnqueued: boolean;
  startedAt: string;
  stats: Record<string, unknown>;
}

/**
 * `ingest_runs` em memória (só testes): índices únicos por janela separados para `cron` e `fast`,
 * runs `manual` sempre novos, e fontes filtradas e ordenadas como `activeSources` do banco.
 */
export function createMemoryRunStore(input: DueSourceInput[] | MemoryRunStoreOptions = {}) {
  const opts: MemoryRunStoreOptions = Array.isArray(input) ? { sources: input } : input;
  const sources = (opts.sources ?? []).map(dueSource);
  const runs: MemoryRun[] = [];
  let seq = 0;

  const create = (
    trigger: RunTrigger,
    windowStart: string,
    stats: Record<string, unknown> = {},
  ): MemoryRun => {
    const run: MemoryRun = {
      runId: `run-${++seq}`,
      trigger,
      windowStart,
      open: true,
      fetchEnqueued: false,
      // Relógio lógico: a ordem de criação define o "mais recente".
      startedAt: new Date(Date.UTC(2026, 8, 27, 0, 0, seq)).toISOString(),
      stats,
    };
    runs.push(run);
    return run;
  };
  const startWindowed = (trigger: "cron" | "fast", windowStart: Date): StartedRun => {
    const key = windowStart.toISOString();
    const existing = runs.find((r) => r.trigger === trigger && r.windowStart === key);
    if (existing)
      return { runId: existing.runId, created: false, fetchEnqueued: existing.fetchEnqueued };
    const run = create(trigger, key);
    return { runId: run.runId, created: true, fetchEnqueued: false };
  };
  const lastOf = (trigger: RunTrigger): string | null =>
    runs
      .filter((r) => r.trigger === trigger)
      .map((r) => r.startedAt)
      .sort()
      .at(-1) ?? null;

  const store: RunStore = {
    async startRun(windowStart) {
      return startWindowed("cron", windowStart);
    },
    async startFastRun(windowStart) {
      return startWindowed("fast", windowStart);
    },
    async startManualRun(sourceId) {
      return { runId: create("manual", `manual-${seq + 1}`, { source: sourceId }).runId };
    },
    async markFetchEnqueued(runId, count, extra = {}) {
      for (const r of runs)
        if (r.runId === runId) {
          r.fetchEnqueued = true;
          r.stats = { ...r.stats, fetch_enqueued: count, ...extra };
        }
    },
    async previousOpenRun(windowStart) {
      const before = runs
        .filter((r) => r.trigger === "cron" && r.windowStart < windowStart.toISOString() && r.open)
        .sort((a, b) => (a.windowStart < b.windowStart ? 1 : -1));
      return before[0]?.runId ?? null;
    },
    async activeSources() {
      return sources
        .filter((s) => s.status === "active" || s.status === "degraded")
        .sort(
          (a, b) =>
            a.priority - b.priority ||
            b.editorialScore - a.editorialScore ||
            (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0),
        );
    },
    async defaultFrequency() {
      return opts.defaultFrequency ?? 30;
    },
    async fastLaneMax() {
      return opts.fastLaneMax ?? 10;
    },
    async lastStartedAt() {
      return lastOf("cron");
    },
    async lastFastStartedAt() {
      return lastOf("fast");
    },
  };
  return Object.assign(store, {
    count: () => runs.length,
    /** Runs criados, na ordem. */
    created: runs,
    run: (runId: string) => runs.find((r) => r.runId === runId),
  });
}
