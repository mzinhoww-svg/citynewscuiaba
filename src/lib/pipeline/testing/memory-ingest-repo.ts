import type {
  CollectedInsert,
  IngestRepo,
  RawItemRecord,
  SourcePatch,
  SourceRecord,
} from "../ports";

type SourceRow = SourceRecord & { lastError: string | null; lastFetchedAt: string | null };

/** Banco da Coleta em memória (só testes). */
export function createMemoryIngestRepo(sources: SourceRecord[]) {
  const rows: SourceRow[] = sources.map((s) => ({ ...s, lastError: null, lastFetchedAt: null }));
  const raws: (RawItemRecord & { error?: string })[] = [];
  const collected: (CollectedInsert & { id: string })[] = [];
  const hits = new Map<string, number>();
  let seq = 0;

  const repo: IngestRepo = {
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
      if (existing) return { id: existing.id, created: false };
      const id = `item-${++seq}`;
      collected.push({ ...item, id });
      return { id, created: true };
    },
  };
  return Object.assign(repo, {
    source: (slug: string) => rows.find((s) => s.slug === slug),
    raw: () => raws,
    collected: () => collected,
  });
}
