import type {
  ArticleStatus,
  ConfidenceLevel,
  DecisionContext,
  DecisionRecord,
  DraftContext,
  DraftInput,
  NotificationInput,
  PublishRepo,
  SourceReliability,
} from "../ports";

export interface MemoryTopicItem {
  id: string;
  sourceSlug: string;
  title: string;
  excerpt?: string | null;
  tags?: string[];
  sensitive?: boolean;
  sectionSlug?: string | null;
}

export interface MemoryTopic {
  id: string;
  slug: string;
  title: string;
  sectionSlug: string | null;
  confidence: ConfidenceLevel;
  confidenceScore: number;
  items: MemoryTopicItem[];
  verify?: DraftContext["verify"];
}

interface ArticleRow {
  id: string;
  topicId: string;
  slug: string;
  input: DraftInput;
  status: ArticleStatus;
  publishMode: "human" | "auto" | null;
  publishedAt: string | null;
  rulesVersion: number | null;
  reviewReason: string | null;
  version: number;
  humanEdited: boolean;
  urgent: boolean;
  imageApproved: boolean;
  indexed: { embedding: number[] | null } | null;
}

/** Assuntos, matérias, decisões e notificações em memória para as etapas 11 a 20 (só testes). */
export function createMemoryPublishRepo(
  sources: Record<string, { reliability: SourceReliability; name: string }>,
  categories: Record<string, string> = {},
) {
  const topics = new Map<string, MemoryTopic>();
  const articles = new Map<string, ArticleRow>();
  const decisions: DecisionRecord[] = [];
  const notifications: (NotificationInput & { at: number })[] = [];
  const audits: {
    actor: string;
    action: string;
    objectRef: string;
    details: Record<string, unknown>;
  }[] = [];
  let seq = 0;
  let clock = 0;
  const src = (slug: string) => {
    const s = sources[slug];
    if (!s) throw new Error(`fonte ${slug} não cadastrada no teste`);
    return s;
  };
  const byTopic = (topicId: string) => [...articles.values()].find((a) => a.topicId === topicId);

  const repo: PublishRepo = {
    async draftContext(topicId) {
      const t = topics.get(topicId);
      if (!t) return null;
      const a = byTopic(topicId);
      return {
        topic: {
          id: t.id,
          slug: t.slug,
          title: t.title,
          sectionSlug: t.sectionSlug,
          confidence: t.confidence,
          confidenceScore: t.confidenceScore,
        },
        items: t.items.map((i) => ({
          id: i.id,
          sourceId: `src-${i.sourceSlug}`,
          sourceSlug: i.sourceSlug,
          sourceName: src(i.sourceSlug).name,
          reliability: src(i.sourceSlug).reliability,
          title: i.title,
          excerpt: i.excerpt ?? null,
          publishedAt: "2026-09-27T12:00:00Z",
          sectionSlug: i.sectionSlug ?? null,
          canonicalUrl: `https://${i.sourceSlug}.example/${i.id}`,
          tags: i.tags ?? [],
          sensitive: i.sensitive ?? false,
        })),
        verify: t.verify ?? null,
        article: a
          ? {
              id: a.id,
              status: a.status,
              publishMode: a.publishMode,
              humanEdited: a.humanEdited,
              version: a.version,
            }
          : null,
      };
    },
    async saveDraft(d) {
      let a = byTopic(d.topicId);
      if (a && (a.humanEdited || (a.status !== "draft" && a.status !== "in_review")))
        throw new Error("matéria já está com a redação");
      if (!a) {
        a = {
          id: `a-${++seq}`,
          topicId: d.topicId,
          slug: d.slug,
          input: d,
          status: d.status,
          publishMode: null,
          publishedAt: null,
          rulesVersion: null,
          reviewReason: d.reviewReason,
          version: 0,
          humanEdited: false,
          urgent: false,
          imageApproved: false,
          indexed: null,
        };
        articles.set(a.id, a);
      }
      a.input = structuredClone(d);
      a.status = d.status;
      a.reviewReason = d.reviewReason;
      a.version++;
      return { articleId: a.id, version: a.version };
    },
    async decisionContext(articleId): Promise<DecisionContext | null> {
      const a = articles.get(articleId);
      if (!a) return null;
      const t = topics.get(a.topicId)!;
      const items = t.items.filter((i) => a.input.sources.some((s) => s.itemId === i.id));
      const sourcesUsed = new Set(items.map((i) => i.sourceSlug));
      const primary = new Set(
        items.filter((i) => src(i.sourceSlug).reliability === "primary").map((i) => i.sourceSlug),
      );
      return {
        articleId: a.id,
        slug: a.slug,
        topicId: a.topicId,
        status: a.status,
        publishMode: a.publishMode,
        sectionSlug: a.input.sectionSlug,
        category: categories[a.input.sectionSlug] ?? a.input.sectionSlug,
        title: a.input.title,
        urgent: a.urgent,
        aiFallback: a.input.aiFallback,
        confidence: a.input.confidence,
        confidenceScore: a.input.confidenceScore,
        version: a.version,
        humanEdited: a.humanEdited,
        independentSources: sourcesUsed.size,
        primarySources: primary.size,
        tags: [...new Set(items.flatMap((i) => i.tags ?? []))],
        sensitive: items.some((i) => i.sensitive),
        centralConflict: t.verify?.centralConflict ?? false,
        imageApproved: a.imageApproved,
      };
    },
    async setStatus(articleId, p) {
      const a = articles.get(articleId);
      if (!a) return;
      a.status = p.status;
      if (p.publishMode !== undefined) a.publishMode = p.publishMode;
      if (p.publishedAt !== undefined) a.publishedAt = p.publishedAt;
      if (p.rulesVersion !== undefined) a.rulesVersion = p.rulesVersion;
      if (p.reviewReason !== undefined) a.reviewReason = p.reviewReason;
    },
    async articleText(articleId) {
      const a = articles.get(articleId);
      return a ? `${a.input.title}\n${a.input.dek}` : null;
    },
    async indexArticle(articleId, embedding) {
      const a = articles.get(articleId);
      if (a) a.indexed = { embedding };
    },
    async findDecision(objectRef, step, inputHash) {
      return (
        decisions.findLast(
          (d) => d.objectRef === objectRef && d.step === step && d.inputHash === inputHash,
        ) ?? null
      );
    },
    async latestDecision(objectRef, step) {
      return decisions.findLast((d) => d.objectRef === objectRef && d.step === step) ?? null;
    },
    async recordDecision(d) {
      decisions.push(structuredClone(d));
    },
    async notifyOnce(n, windowSec) {
      const dup = notifications.some(
        (x) =>
          x.dedupeKey === n.dedupeKey && x.channel === n.channel && clock - x.at < windowSec * 1000,
      );
      if (dup) return false;
      notifications.push({ ...n, at: clock });
      return true;
    },
    async audit(entry) {
      audits.push(structuredClone(entry));
    },
  };

  return Object.assign(repo, {
    addTopic(t: MemoryTopic) {
      topics.set(t.id, structuredClone(t));
    },
    article: (id: string) => articles.get(id),
    articleOfTopic: (topicId: string) => byTopic(topicId),
    markHumanEdited(id: string) {
      const a = articles.get(id);
      if (a) a.humanEdited = true;
    },
    approveImage(id: string) {
      const a = articles.get(id);
      if (a) a.imageApproved = true;
    },
    setUrgent(id: string) {
      const a = articles.get(id);
      if (a) a.urgent = true;
    },
    advance(ms: number) {
      clock += ms;
    },
    decisions: () => decisions,
    notifications: () => notifications,
    audits: () => audits,
  });
}
