import { hamming } from "../simhash";
import type {
  DecisionRecord,
  MediaAssetRecord,
  MediaContext,
  MediaRepo,
  NewMediaAsset,
} from "../ports";

interface StoredAsset extends MediaAssetRecord {
  phash: bigint | null;
  details: NewMediaAsset | null;
  removedReason: string | null;
}

/** Matérias, acervo e assets em memória para a etapa de imagem (só testes). */
export function createMemoryMediaRepo(opts: { rateLimit?: boolean } = {}) {
  const contexts = new Map<string, MediaContext>();
  const assets: StoredAsset[] = [];
  const links: { articleId: string; mediaId: string; rationale: string; chosenBy: string }[] = [];
  const decisions: DecisionRecord[] = [];
  const audits: {
    actor: string;
    action: string;
    objectRef: string;
    details: Record<string, unknown>;
  }[] = [];
  let seq = 0;

  const view = (a: StoredAsset): MediaAssetRecord => ({
    id: a.id,
    kind: a.kind,
    storagePath: a.storagePath,
    originUrl: a.originUrl,
    status: a.status,
    width: a.width,
    height: a.height,
    credit: a.credit,
    sourceId: a.sourceId,
    tags: a.tags,
  });

  const repo: MediaRepo = {
    async hitRateLimit() {
      return opts.rateLimit !== false;
    },
    async mediaContext(articleId) {
      const c = contexts.get(articleId);
      if (!c) return null;
      return { ...c, hasMedia: links.some((l) => l.articleId === articleId) };
    },
    async assetByOrigin(originUrl) {
      const a = assets.find((x) => x.originUrl === originUrl);
      return a ? view(a) : null;
    },
    async phashNeighbors(phash, maxDistance, excludeOrigin) {
      return assets
        .filter((a) => a.status !== "blocked" && a.phash !== null && a.originUrl !== excludeOrigin)
        .map((a) => hamming(a.phash!, phash))
        .filter((d) => d <= maxDistance);
    },
    async archiveCandidates(tags, limit) {
      return assets
        .filter(
          (a) =>
            a.kind === "illustrative" &&
            a.status === "approved" &&
            a.tags.some((t) => tags.includes(t)),
        )
        .slice(0, limit)
        .map(view);
    },
    async insertAsset(a) {
      const id = `m-${++seq}`;
      assets.push({
        id,
        kind: a.kind,
        storagePath: a.storagePath,
        originUrl: a.originUrl,
        status: "approved",
        width: a.width,
        height: a.height,
        credit: a.credit,
        sourceId: a.sourceId,
        tags: [],
        phash: a.phash,
        details: structuredClone(a),
        removedReason: null,
      });
      return id;
    },
    async linkArticleMedia(articleId, mediaId, rationale, chosenBy) {
      if (!links.some((l) => l.articleId === articleId && l.mediaId === mediaId))
        links.push({ articleId, mediaId, rationale, chosenBy });
    },
    async recordDecision(d) {
      decisions.push(structuredClone(d));
    },
    async asset(id) {
      const a = assets.find((x) => x.id === id);
      return a ? view(a) : null;
    },
    async reproductionsOfSource(sourceId) {
      return assets
        .filter(
          (a) => a.kind === "reproduction" && a.sourceId === sourceId && a.status !== "blocked",
        )
        .map(view);
    },
    async blockAsset(id, reason) {
      const a = assets.find((x) => x.id === id);
      if (!a) return { articleIds: [] };
      a.status = "blocked";
      a.removedReason = reason;
      return { articleIds: links.filter((l) => l.mediaId === id).map((l) => l.articleId) };
    },
    async audit(entry) {
      audits.push(structuredClone(entry));
    },
  };

  return Object.assign(repo, {
    setContext(c: Omit<MediaContext, "hasMedia">) {
      contexts.set(c.articleId, { ...c, hasMedia: false });
    },
    addArchive(a: { id: string; tags: string[]; width?: number; height?: number }) {
      assets.push({
        id: a.id,
        kind: "illustrative",
        storagePath: `acervo/${a.id}.png`,
        originUrl: null,
        status: "approved",
        width: a.width ?? 1600,
        height: a.height ?? 1067,
        credit: null,
        sourceId: null,
        tags: a.tags,
        phash: null,
        details: null,
        removedReason: null,
      });
    },
    assets: () => assets,
    links: () => links,
    decisions: () => decisions,
    audits: () => audits,
  });
}
