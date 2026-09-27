import type { DueSource, RunStore } from "../ports";

/** `ingest_runs` em memória (só testes). */
export function createMemoryRunStore(sources: DueSource[]) {
  const runs = new Map<string, { runId: string; open: boolean; fetchEnqueued: boolean }>();
  let seq = 0;
  const store: RunStore = {
    async startRun(windowStart) {
      const key = windowStart.toISOString();
      const existing = runs.get(key);
      if (existing)
        return { runId: existing.runId, created: false, fetchEnqueued: existing.fetchEnqueued };
      const run = { runId: `run-${++seq}`, open: true, fetchEnqueued: false };
      runs.set(key, run);
      return { runId: run.runId, created: true, fetchEnqueued: false };
    },
    async markFetchEnqueued(runId) {
      for (const r of runs.values()) if (r.runId === runId) r.fetchEnqueued = true;
    },
    async previousOpenRun(windowStart) {
      const before = [...runs.entries()]
        .filter(([w, r]) => w < windowStart.toISOString() && r.open)
        .sort(([a], [b]) => (a < b ? 1 : -1));
      return before[0]?.[1].runId ?? null;
    },
    async activeSources() {
      return sources;
    },
  };
  return Object.assign(store, { count: () => runs.size });
}
