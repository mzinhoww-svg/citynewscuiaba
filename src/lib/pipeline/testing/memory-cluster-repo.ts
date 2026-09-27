import type { ClusterRepo, CollectedItemRecord } from "../ports";
import { hamming } from "../simhash";
import { cosine } from "../vector";

interface Topic {
  id: string;
  slug: string;
  title: string;
  centroid: number[];
  updatedAt: string;
  members: string[];
}

type Row = CollectedItemRecord & { seq: number; createdAt: string };

/** Itens coletados e assuntos em memória, com a mesma semântica das funções SQL (só testes). */
export function createMemoryClusterRepo() {
  const rows: Row[] = [];
  const topics: Topic[] = [];
  let seq = 0;
  const find = (id: string) => rows.find((r) => r.id === id);

  const recompute = (t: Topic) => {
    const vs = rows.filter((r) => r.topicId === t.id && !r.duplicateOf && r.embedding);
    const dim = vs[0]?.embedding?.length ?? 0;
    t.centroid = Array.from(
      { length: dim },
      (_, i) => vs.reduce((s, r) => s + r.embedding![i]!, 0) / vs.length,
    );
    t.members = vs.map((r) => r.id);
  };

  const repo: ClusterRepo = {
    async collectedItem(id) {
      const r = find(id);
      if (!r) return null;
      const { seq: _s, createdAt: _c, ...item } = r;
      return { ...item, embedding: item.embedding ? [...item.embedding] : null };
    },
    async saveFingerprint(id, f) {
      const r = find(id);
      if (r) Object.assign(r, { simhash: f.simhash, embedding: [...f.embedding] });
    },
    async dedupeCandidates(id, q) {
      const self = find(id);
      if (!self?.embedding) return [];
      return rows
        .filter(
          (r) =>
            r.seq < self.seq &&
            !r.duplicateOf &&
            r.simhash !== null &&
            Date.parse(r.createdAt) >= q.since.getTime(),
        )
        .map((r) => ({
          id: r.id,
          simhash: r.simhash!,
          cosine: r.embedding ? cosine(r.embedding, self.embedding!) : null,
          topicId: r.topicId,
          ham: hamming(r.simhash!, q.simhash),
        }))
        .filter((c) => c.ham <= q.maxHamming || (c.cosine ?? -1) >= q.minCosine)
        .sort((a, b) => Number(b.ham <= q.maxHamming) - Number(a.ham <= q.maxHamming))
        .slice(0, q.limit)
        .map(({ ham: _h, ...c }) => c);
    },
    async markDuplicate(id, originalId) {
      const r = find(id);
      const o = find(originalId);
      if (r && o) Object.assign(r, { duplicateOf: o.id, topicId: o.topicId });
    },
    async topicCandidates(id, q) {
      const self = find(id);
      if (!self?.embedding) return [];
      return topics
        .filter((t) => Date.parse(t.updatedAt) >= q.since.getTime() && t.centroid.length > 0)
        .sort((a, b) => cosine(b.centroid, self.embedding!) - cosine(a.centroid, self.embedding!))
        .slice(0, q.limit)
        .map((t) => ({ topicId: t.id, centroid: [...t.centroid], updatedAt: t.updatedAt }));
    },
    async attachToTopic(id, topicId, now) {
      const r = find(id);
      const t = topics.find((x) => x.id === topicId);
      if (!r || !t || r.topicId) return;
      r.topicId = t.id;
      recompute(t);
      if (now.toISOString() > t.updatedAt) t.updatedAt = now.toISOString();
    },
    async createTopic(id, t, now) {
      const r = find(id);
      if (!r) throw new Error(`item ${id} não existe`);
      if (r.topicId) return r.topicId;
      const topic: Topic = {
        id: `topic-${++seq}`,
        slug: t.slug,
        title: t.title,
        centroid: [],
        updatedAt: now.toISOString(),
        members: [],
      };
      topics.push(topic);
      r.topicId = topic.id;
      recompute(topic);
      return topic.id;
    },
  };

  return Object.assign(repo, {
    add(i: { id: string; title: string; excerpt?: string | null; sourceId?: string }) {
      rows.push({
        id: i.id,
        sourceId: i.sourceId ?? "src-1",
        title: i.title,
        excerpt: i.excerpt ?? null,
        publishedAt: null,
        simhash: null,
        embedding: null,
        duplicateOf: null,
        topicId: null,
        seq: ++seq,
        createdAt: "2026-09-26T23:00:00.000Z",
      });
    },
    item: (id: string) => find(id),
    topics: () => topics,
  });
}
