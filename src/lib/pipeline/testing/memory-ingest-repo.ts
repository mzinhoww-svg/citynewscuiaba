import type { SourceState } from "@/lib/sources/types";
import type {
  CollectedInsert,
  IngestRepo,
  NotificationInput,
  RawItemRecord,
  RunTrigger,
  SourcePatch,
  SourceRecord,
} from "../ports";

type SourceRow = SourceRecord & { lastError: string | null; lastFetchedAt: string | null };

export interface HealthRecord {
  sourceId: string;
  outcome: "ok" | "not_modified" | "failed";
  latencyMs: number;
  itemsNew: number;
  error: string | null;
}

export interface MemoryIngestOptions {
  /** Como cada run foi disparado (padrão: `cron`). */
  runs?: Record<string, RunTrigger>;
  clock?: () => Date;
}

/** Banco da Coleta em memória (só testes). */
export function createMemoryIngestRepo(sources: SourceRecord[], opts: MemoryIngestOptions = {}) {
  const clock = opts.clock ?? (() => new Date());
  const rows: SourceRow[] = sources.map((s) => ({
    ...s,
    consecutiveFailures: s.consecutiveFailures ?? 0,
    statusReason: s.statusReason ?? null,
    consumption: s.consumption ?? null,
    lastError: null,
    lastFetchedAt: null,
  }));
  const raws: (RawItemRecord & { error?: string })[] = [];
  const collected: (CollectedInsert & { id: string })[] = [];
  const hits = new Map<string, number>();
  const advanced = new Set<string>();
  const runTriggers = new Map<string, RunTrigger>(Object.entries(opts.runs ?? {}));
  const claims = new Map<string, { at: number; runId: string }>();
  const health: HealthRecord[] = [];
  const notifications: NotificationInput[] = [];
  let seq = 0;

  const repo: IngestRepo = {
    async runTrigger(runId) {
      return runTriggers.get(runId) ?? "cron";
    },
    /** Mesma regra do `claim_source_fetch`: nunca iniciada, iniciada antes de `since` ou o mesmo run. */
    async claimFetch(sourceId, runId, since) {
      const c = claims.get(sourceId);
      if (c && c.at >= since.getTime() && c.runId !== runId) return false;
      claims.set(sourceId, { at: clock().getTime(), runId });
      return true;
    },
    async recordFetch(sourceId, outcome, latencyMs, itemsNew, error) {
      health.push({ sourceId, outcome, latencyMs, itemsNew, error });
    },
    async applySourceState(id, patch: Partial<SourceState>, expectedStatus) {
      const s = rows.find((x) => x.id === id);
      if (!s || s.status !== expectedStatus) return false;
      if (s.status !== "active" && s.status !== "degraded") return false;
      if (patch.status !== undefined) s.status = patch.status;
      if (patch.statusReason !== undefined) s.statusReason = patch.statusReason;
      if (patch.consecutiveFailures !== undefined)
        s.consecutiveFailures = patch.consecutiveFailures;
      return true;
    },
    async notifyOnce(n) {
      if (notifications.some((x) => x.dedupeKey === n.dedupeKey && x.channel === n.channel))
        return false;
      notifications.push(n);
      return true;
    },
    async sourceBySlug(slug) {
      return rows.find((s) => s.slug === slug) ?? null;
    },
    async sourceById(id) {
      return rows.find((s) => s.id === id) ?? null;
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
    /** Saúde do dia registrada por `recordFetch`, na ordem. */
    health: () => health,
    /** Notificações gravadas (uma por chave e canal). */
    notifications: () => notifications,
    /** Marca o item como já classificado (avançou além da Coleta). */
    markAdvanced: (id: string) => void advanced.add(id),
  });
}
