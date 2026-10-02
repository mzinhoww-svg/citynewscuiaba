import { hamming } from "../simhash";
import type {
  DecisionRecord,
  MediaAssetRecord,
  MediaContext,
  MediaRepo,
  MediaSlot,
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
  const links: {
    articleId: string;
    mediaId: string;
    rationale: string;
    chosenBy: string;
    role: "cover" | "inline";
    position: number | null;
  }[] = [];
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
      const mine = links.filter((l) => l.articleId === articleId);
      const slot = (role: "cover" | "inline"): MediaSlot | null => {
        const l = mine.find((x) => x.role === role);
        const a = l && assets.find((x) => x.id === l.mediaId);
        return l && a
          ? {
              mediaId: a.id,
              sourceId: a.sourceId,
              originUrl: a.originUrl,
              kind: a.kind,
              status: a.status,
              phash: a.phash,
            }
          : null;
      };
      return {
        ...c,
        hasMedia: mine.length > 0,
        cover: slot("cover"),
        inline: slot("inline"),
        humanMedia: mine.some((l) => !l.chosenBy.startsWith("pipeline")),
      };
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
    async linkArticleMedia(articleId, mediaId, rationale, chosenBy, slot) {
      const role = slot?.role ?? "cover";
      if (
        links.some((l) => l.articleId === articleId && (l.mediaId === mediaId || l.role === role))
      )
        return;
      links.push({
        articleId,
        mediaId,
        rationale,
        chosenBy,
        role,
        position: role === "inline" ? (slot?.position ?? null) : null,
      });
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
    setContext(
      c: Omit<
        MediaContext,
        "hasMedia" | "cover" | "inline" | "bodyParagraphs" | "humanMedia" | "humanEdited"
      > &
        Partial<Pick<MediaContext, "bodyParagraphs" | "humanEdited">>,
    ) {
      contexts.set(c.articleId, {
        ...c,
        bodyParagraphs: c.bodyParagraphs ?? 5,
        humanEdited: c.humanEdited ?? false,
        hasMedia: false,
        cover: null,
        inline: null,
        humanMedia: false,
      });
    },
    /** Liga à matéria uma imagem escolhida por pessoa (ou qualquer `chosenBy`). */
    link(
      articleId: string,
      mediaId: string,
      chosenBy: string,
      role: "cover" | "inline" = "cover",
      position?: number,
    ) {
      links.push({
        articleId,
        mediaId,
        rationale: "teste",
        chosenBy,
        role,
        position: role === "inline" ? (position ?? 3) : null,
      });
    },
    /** Asset já existente (por exemplo, a capa que a matéria tinha antes do reprocesso). */
    addAsset(a: {
      id: string;
      kind?: MediaAssetRecord["kind"];
      originUrl: string;
      sourceId: string;
      width?: number;
      height?: number;
    }) {
      assets.push({
        id: a.id,
        kind: a.kind ?? "reproduction",
        storagePath: `reproducao/${a.id}.jpg`,
        originUrl: a.originUrl,
        status: "approved",
        width: a.width ?? 1600,
        height: a.height ?? 900,
        credit: null,
        sourceId: a.sourceId,
        tags: [],
        phash: null,
        details: null,
        removedReason: null,
      });
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
