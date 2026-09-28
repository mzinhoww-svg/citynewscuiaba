import type {
  CollectedInsert,
  IngestRepo,
  NotificationInput,
  RawItemRecord,
  RunTrigger,
  SourceFetchRecord,
  SourcePatch,
  SourceRecord,
} from "../ports";

type SourceRow = SourceRecord & {
  lastError: string | null;
  lastFetchedAt: string | null;
  lastFetchStartedAt: string | null;
  lastFetchRunId: string | null;
};

export interface MemoryIngestOptions {
  /** `ingest_runs.trigger` por run; run desconhecido conta como `cron` (igual ao banco sem run). */
  triggers?: Record<string, RunTrigger>;
}

/** Banco da Coleta em memória (só testes). */
export function createMemoryIngestRepo(sources: SourceRecord[], opts: MemoryIngestOptions = {}) {
  const rows: SourceRow[] = sources.map((s) => ({
    ...s,
    lastError: null,
    lastFetchedAt: null,
    lastFetchStartedAt: null,
    lastFetchRunId: null,
  }));
  const raws: (RawItemRecord & { error?: string })[] = [];
  const collected: (CollectedInsert & { id: string })[] = [];
  const hits = new Map<string, number>();
  const advanced = new Set<string>();
  const health: {
    sourceId: string;
    outcome: SourceFetchRecord;
    latencyMs: number | null;
    itemsNew: number;
    error: string | null;
  }[] = [];
  const notifications: NotificationInput[] = [];
  let seq = 0;

  const repo: IngestRepo = {
    async sourceBySlug(slug) {
      const s = rows.find((x) => x.slug === slug);
      return s ? { ...s } : null;
    },
    async sourceById(id) {
      const s = rows.find((x) => x.id === id);
      return s ? { ...s } : null;
    },
    async updateSource(id, patch: SourcePatch) {
      const s = rows.find((x) => x.id === id);
      if (s) Object.assign(s, patch);
    },
    async hitRateLimit(bucket, limit) {
      const n = (hits.get(bucket) ?? 0) + 1;
      hits.set(bucket, n);
      return n <= limit;
    },
    async runTrigger(runId) {
      return opts.triggers?.[runId] ?? "cron";
    },
    async claimFetch(sourceId, runId, since) {
      // Mesma condição de `claim_source_fetch`; aqui o "início" gravado é a própria janela.
      const s = rows.find((x) => x.id === sourceId);
      if (!s) return false;
      const sinceIso = since.toISOString();
      const free =
        s.lastFetchStartedAt === null ||
        s.lastFetchStartedAt < sinceIso ||
        s.lastFetchRunId === runId;
      if (!free) return false;
      s.lastFetchStartedAt = sinceIso;
      s.lastFetchRunId = runId;
      return true;
    },
    async recordFetch(sourceId, outcome, latencyMs, itemsNew, error) {
      health.push({ sourceId, outcome, latencyMs, itemsNew, error });
    },
    async applySourceState(id, patch) {
      const s = rows.find((x) => x.id === id);
      if (s && (s.status === "active" || s.status === "degraded")) Object.assign(s, patch);
    },
    async notifyOnce(n) {
      if (notifications.some((x) => x.dedupeKey === n.dedupeKey && x.channel === n.channel))
        return false;
      notifications.push(n);
      return true;
    },
    async insertRawItem({ runId, sourceId, payload }) {
      const existing = raws.find((r) => r.runId === runId && r.sourceId === sourceId);
      if (existing) return existing.id;
      const id = `raw-${++seq}`;
      raws.push({ id, runId, sourceId, state: "new", payload, entries: null });
      return id;
    },
    async rawItem(id) {
      return raws.find((r) => r.id === id) ?? null;
    },
    async updateRawItem(id, patch) {
      const r = raws.find((x) => x.id === id);
      if (r) Object.assign(r, patch);
    },
    async insertCollectedItem(item) {
      const existing = collected.find((c) => c.canonicalUrl === item.canonicalUrl);
      if (existing) return { id: existing.id, created: false, pending: !advanced.has(existing.id) };
      const id = `item-${++seq}`;
      collected.push({ ...item, id });
      return { id, created: true, pending: true };
    },
  };
  return Object.assign(repo, {
    source: (slug: string) => rows.find((s) => s.slug === slug),
    raw: () => raws,
    collected: () => collected,
    /** `record_source_fetch` gravados, na ordem. */
    health: () => health,
    notifications: () => notifications,
    /** Marca o item como já classificado (avançou além da Coleta). */
    markAdvanced: (id: string) => void advanced.add(id),
  });
}
