import type { DueSource, RunStart, RunStore, RunTrigger, SourceStatus } from "../ports";

/** Fonte de teste: `status` ausente = `active`; `paused` e `blocked` não entram em `activeSources`. */
export type MemorySource = DueSource & { status?: SourceStatus };

export interface MemoryRunStoreOptions {
  sources?: MemorySource[];
  /** `app_settings`: padrão de frequência (30) e vagas da via rápida (10). */
  defaultFrequency?: number;
  fastLaneMax?: number;
  /** Relógio de `started_at` (padrão: agora). */
  clock?: () => Date;
}

interface Run {
  runId: string;
  trigger: RunTrigger;
  windowStart: string;
  open: boolean;
  fetchEnqueued: boolean;
  startedAt: string;
  sourceId?: string;
  stats?: { fetchEnqueued: number; skipped: { slug: string; reason: string }[] };
}

/** `ingest_runs` em memória (só testes). Aceita a lista de fontes ou opções. */
export function createMemoryRunStore(input: MemorySource[] | MemoryRunStoreOptions = []) {
  const opts: MemoryRunStoreOptions = Array.isArray(input) ? { sources: input } : input;
  const sources = opts.sources ?? [];
  const clock = opts.clock ?? (() => new Date());
  const runs: Run[] = [];
  let seq = 0;

  const start = (trigger: "cron" | "fast", windowStart: Date): RunStart => {
    const key = windowStart.toISOString();
    const existing = runs.find((r) => r.trigger === trigger && r.windowStart === key);
    if (existing)
      return { runId: existing.runId, created: false, fetchEnqueued: existing.fetchEnqueued };
    const run: Run = {
      runId: `run-${++seq}`,
      trigger,
      windowStart: key,
      open: true,
      fetchEnqueued: false,
      startedAt: clock().toISOString(),
    };
    runs.push(run);
    return { runId: run.runId, created: true, fetchEnqueued: false };
  };
  const lastOf = (trigger: RunTrigger, sourceId?: string) =>
    runs
      .filter((r) => r.trigger === trigger && (sourceId === undefined || r.sourceId === sourceId))
      .map((r) => r.startedAt)
      .sort()
      .at(-1) ?? null;

  const store: RunStore = {
    async startRun(windowStart) {
      return start("cron", windowStart);
    },
    async startFastRun(windowStart) {
      return start("fast", windowStart);
    },
    async startManualRun(sourceId) {
      const run: Run = {
        runId: `run-${++seq}`,
        trigger: "manual",
        windowStart: clock().toISOString(),
        open: true,
        fetchEnqueued: true,
        startedAt: clock().toISOString(),
        sourceId,
      };
      runs.push(run);
      return run.runId;
    },
    async markFetchEnqueued(runId, count, extra) {
      const r = runs.find((x) => x.runId === runId);
      if (!r) return;
      r.fetchEnqueued = true;
      r.stats = { fetchEnqueued: count, skipped: extra?.skipped ?? [] };
    },
    async previousOpenRun(windowStart) {
      const before = runs
        .filter((r) => r.trigger === "cron" && r.windowStart < windowStart.toISOString() && r.open)
        .sort((a, b) => (a.windowStart < b.windowStart ? 1 : -1));
      return before[0]?.runId ?? null;
    },
    async activeSources() {
      return sources
        .filter((s) => (s.status ?? "active") === "active" || s.status === "degraded")
        .sort(
          (a, b) =>
            a.priority - b.priority ||
            b.editorialScore - a.editorialScore ||
            (a.slug < b.slug ? -1 : 1),
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
    async lastManualRunAt(sourceId) {
      return lastOf("manual", sourceId);
    },
  };
  return Object.assign(store, {
    /** Runs criados (qualquer via), com o `trigger`. */
    created: runs,
    count: () => runs.length,
    /** Fecha o run (fim da coleta) para o teste do ciclo anterior. */
    close: (runId: string) => {
      const r = runs.find((x) => x.runId === runId);
      if (r) r.open = false;
    },
  });
}
