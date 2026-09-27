import type {
  DecisionRecord,
  ItemPatch,
  SourceReliability,
  TopicBundle,
  UnderstandRepo,
} from "../ports";

export interface MemoryItemInput {
  id: string;
  sourceSlug: string;
  title: string;
  excerpt?: string | null;
  publishedAt?: string | null;
  topicId?: string | null;
  duplicateOf?: string | null;
  sectionSlug?: string | null;
  locality?: string;
}

interface Row {
  id: string;
  sourceSlug: string;
  title: string;
  excerpt: string | null;
  publishedAt: string | null;
  topicId: string | null;
  duplicateOf: string | null;
  sectionSlug: string | null;
  relevance: number | null;
  sensitive: boolean | null;
  locality: string;
  neighborhood: string | null;
  quarantineReason: string | null;
}

interface TopicRow {
  id: string;
  updatedAt: string;
  confidence: string;
  confidenceScore: number;
  sectionSlug: string | null;
}

/** Itens, assuntos e decisões em memória para classify, locate e verify (só testes). */
export function createMemoryUnderstandRepo(
  sources: Record<string, { reliability: SourceReliability; locality: string }>,
) {
  const rows: Row[] = [];
  const topics = new Map<string, TopicRow>();
  const decisions: DecisionRecord[] = [];
  const source = (slug: string) => {
    const s = sources[slug];
    if (!s) throw new Error(`fonte ${slug} não cadastrada no teste`);
    return s;
  };
  const find = (id: string) => rows.find((r) => r.id === id);

  const repo: UnderstandRepo = {
    async understandItem(id) {
      const r = find(id);
      if (!r) return null;
      const s = source(r.sourceSlug);
      return {
        id: r.id,
        sourceId: `src-${r.sourceSlug}`,
        sourceSlug: r.sourceSlug,
        reliability: s.reliability,
        sourceLocality: s.locality,
        title: r.title,
        excerpt: r.excerpt,
        publishedAt: r.publishedAt,
        topicId: r.topicId,
        duplicateOf: r.duplicateOf,
        quarantined: r.quarantineReason !== null,
      };
    },
    async updateItem(id, patch: ItemPatch) {
      const r = find(id);
      if (r) Object.assign(r, patch);
    },
    async quarantineItem(id, reason) {
      const r = find(id);
      if (r) r.quarantineReason = reason;
    },
    async findDecision(objectRef, step, inputHash) {
      return (
        decisions.findLast(
          (d) => d.objectRef === objectRef && d.step === step && d.inputHash === inputHash,
        ) ?? null
      );
    },
    async recordDecision(d) {
      decisions.push(structuredClone(d));
    },
    async topicBundle(topicId): Promise<TopicBundle | null> {
      const t = topics.get(topicId);
      if (!t) return null;
      return {
        topicId,
        updatedAt: t.updatedAt,
        items: rows
          .filter((r) => r.topicId === topicId && !r.duplicateOf && r.quarantineReason === null)
          .map((r) => ({
            id: r.id,
            sourceId: `src-${r.sourceSlug}`,
            sourceSlug: r.sourceSlug,
            reliability: source(r.sourceSlug).reliability,
            title: r.title,
            excerpt: r.excerpt,
            publishedAt: r.publishedAt,
            sectionSlug: r.sectionSlug,
          })),
      };
    },
    async updateTopic(topicId, patch) {
      const t = topics.get(topicId);
      if (!t) return;
      t.confidence = patch.confidence;
      t.confidenceScore = patch.confidenceScore;
      if (t.sectionSlug === null && patch.sectionSlug) t.sectionSlug = patch.sectionSlug;
    },
  };

  return Object.assign(repo, {
    add(i: MemoryItemInput) {
      const s = source(i.sourceSlug);
      rows.push({
        id: i.id,
        sourceSlug: i.sourceSlug,
        title: i.title,
        excerpt: i.excerpt ?? null,
        publishedAt: i.publishedAt ?? null,
        topicId: i.topicId ?? null,
        duplicateOf: i.duplicateOf ?? null,
        sectionSlug: i.sectionSlug ?? null,
        relevance: null,
        sensitive: null,
        locality: i.locality ?? s.locality,
        neighborhood: null,
        quarantineReason: null,
      });
      if (i.topicId && !topics.has(i.topicId))
        topics.set(i.topicId, {
          id: i.topicId,
          updatedAt: i.publishedAt ?? "2026-09-27T12:00:00Z",
          confidence: "baixa",
          confidenceScore: 0,
          sectionSlug: null,
        });
    },
    item: (id: string) => find(id),
    topic: (id: string) => topics.get(id),
    decisions: () => decisions,
  });
}
