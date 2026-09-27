import { LABEL_TEXT } from "@/lib/labels";
import { META_SEPARATOR } from "@/content/pt-BR/labels";
import {
  DUPLICATE_MAX_DISTANCE,
  checkImage,
  isSensationalText,
  watermarkHint,
} from "@/lib/media/checks";
import { chooseImage, mayGenerate } from "@/lib/media/choose";
import { fetchImage, outsideSourceDomain, sourceDomain } from "@/lib/media/fetch-image";
import { mediaPath, type MediaStore } from "@/lib/media/store";
import type { Candidate, ImageAnalysis, ImagePolicy, MediaChoice } from "@/lib/media/types";
import { err, ok, type Result } from "@/lib/result";
import { checkRobots } from "../http";
import type { ResolveHost } from "../net";
import type {
  Flags,
  HttpFetch,
  MediaAssetRecord,
  MediaContext,
  MediaRepo,
  MediaSourceItem,
} from "../ports";
import { nextMessage, stepError, type StepHandler } from "../run-step";
import { inputHash } from "./understanding";

export interface MediaStepDeps {
  repo: MediaRepo;
  store: MediaStore;
  flags: Flags;
  http: HttpFetch;
  resolve: ResolveHost;
  userAgent: string;
  now: () => Date;
  analyze: (bytes: Uint8Array) => Promise<Result<ImageAnalysis, string>>;
  /**
   * Há gerador de imagem configurado. No MVP nenhum provedor gera imagem (A-037): a cascata
   * nunca chega a `ai_generated` e segue para o card tipográfico.
   */
  canGenerate?: boolean;
}

/** Imagens de fonte baixadas por matéria, no máximo. */
const MAX_SOURCE_IMAGES = 3;
const ARCHIVE_LIMIT = 12;
const ARTICLE_REF = /^article:(\S+)$/;

export const REPRODUCTION_LICENSE =
  "Reprodução da imagem da matéria original (política reproduction, A-010): rótulo REPRODUÇÃO, crédito e link obrigatórios, sem recorte, remoção em 24 h a pedido.";

interface Prepared {
  item: MediaSourceItem;
  candidate: Candidate;
  existing: MediaAssetRecord | null;
  download: { bytes: Uint8Array; analysis: ImageAnalysis } | null;
}

const hasAgreement = (until: string | null, now: Date): boolean =>
  until !== null && until.slice(0, 10) >= now.toISOString().slice(0, 10);

/** Imagem da fonte pode ser usada? (política + acordo + flag) */
function usableAs(
  item: MediaSourceItem,
  reproductionEnabled: boolean,
  now: Date,
): "original" | "reproduction" | null {
  const p = item.source.imagePolicy;
  if (p === "with_agreement" && hasAgreement(item.source.agreementUntil, now)) return "original";
  if (p === "reproduction" && reproductionEnabled) return "reproduction";
  return null;
}

/** Texto do rótulo da imagem, igual ao de `labelsFor` (REPRODUÇÃO · Fonte · Autor). */
export function imageLabel(choice: MediaChoice): string | null {
  const text: Partial<Record<MediaChoice["kind"], string>> = {
    original: LABEL_TEXT.image_original,
    reproduction: LABEL_TEXT.image_reproduction,
    licensed: LABEL_TEXT.image_licensed,
    illustrative: LABEL_TEXT.image_illustrative,
    ai_generated: LABEL_TEXT.image_ai,
  };
  const base = text[choice.kind];
  if (!base) return null;
  const detail =
    choice.kind === "reproduction" || choice.kind === "licensed"
      ? [choice.credit?.sourceName, choice.credit?.author]
      : choice.kind === "original"
        ? [choice.credit?.author ?? choice.credit?.sourceName]
        : [];
  return [base, ...detail.filter((d): d is string => Boolean(d))].join(META_SEPARATOR);
}

/**
 * Etapas 13 e 14 (imagem e direitos): cascata da spec §6.5 para a matéria. A imagem da fonte só é
 * baixada quando a política permite (acordo vigente ou `reproduction` com a flag ligada), respeita
 * `robots.txt` e o limite da fonte, e é copiada inteira para o Storage com proveniência. Imagem
 * removida a pedido (asset bloqueado) nunca volta. Próxima etapa: `rules`.
 */
export function createMediaStep(deps: MediaStepDeps): StepHandler {
  const prepare = async (
    item: MediaSourceItem,
    imageUrl: string,
  ): Promise<Result<Prepared, string>> => {
    const existing = await deps.repo.assetByOrigin(imageUrl);
    if (existing?.status === "blocked") return err("imagem removida a pedido");
    const base = {
      url: item.pageUrl,
      imageUrl,
      sourceName: item.source.name,
      ...(item.author?.trim() ? { author: item.author.trim() } : {}),
      fit: 1,
      watermark: watermarkHint(imageUrl),
      sensational: isSensationalText(item.title),
    };
    if (existing && existing.width !== null && existing.height !== null)
      return ok({
        item,
        existing,
        download: null,
        candidate: { ...base, width: existing.width, height: existing.height, phashDistances: [] },
      });

    const domain = sourceDomain(item.source.baseUrl);
    let parsed: URL;
    try {
      parsed = new URL(imageUrl);
    } catch {
      return err(`URL de imagem inválida: ${imageUrl}`);
    }
    const outside = domain ? outsideSourceDomain(parsed, domain) : "fonte sem URL base válida";
    if (outside) return err(outside);
    const robots = await checkRobots(
      { repo: deps.repo, http: deps.http, resolve: deps.resolve, userAgent: deps.userAgent },
      imageUrl,
      { bucket: `crawler:${item.source.slug}`, limitPerHour: item.source.rateLimitPerHour },
    );
    if (robots.kind !== "allowed")
      return err(robots.kind === "rate_limited" ? "limite de requisições da fonte" : robots.reason);
    const file = await fetchImage(deps, imageUrl, { sourceBaseUrl: item.source.baseUrl });
    if (!file.ok) return err(file.error);
    const analysis = await deps.analyze(file.value.bytes);
    if (!analysis.ok) return err(analysis.error);
    const distances = await deps.repo.phashNeighbors(
      analysis.value.phash,
      DUPLICATE_MAX_DISTANCE,
      imageUrl,
    );
    return ok({
      item,
      existing: null,
      download: { bytes: file.value.bytes, analysis: analysis.value },
      candidate: {
        ...base,
        width: analysis.value.width,
        height: analysis.value.height,
        phashDistances: distances,
      },
    });
  };

  const sourceImage = async (ctx: MediaContext, reproductionEnabled: boolean, notes: string[]) => {
    const now = deps.now();
    let tried = 0;
    let reproductionOff = false;
    for (const item of ctx.items) {
      if (!item.imageUrl) continue;
      const use = usableAs(item, reproductionEnabled, now);
      if (!use) {
        if (item.source.imagePolicy === "reproduction") reproductionOff = true;
        continue;
      }
      if (tried++ >= MAX_SOURCE_IMAGES) break;
      const p = await prepare(item, item.imageUrl);
      if (!p.ok) {
        notes.push(`${item.source.name}: ${p.error}.`);
        continue;
      }
      const check = checkImage(p.value.candidate, use);
      if (!check.ok) {
        notes.push(`${item.source.name}: imagem reprovada (${check.issues.join(", ")}).`);
        continue;
      }
      return p.value;
    }
    if (reproductionOff) notes.push("Imagem da fonte não usada: reprodução desligada.");
    return null;
  };

  return async (msg) => {
    const articleId = ARTICLE_REF.exec(msg.itemRef)?.[1];
    if (!articleId) return err(stepError.invalid(`referência inválida: ${msg.itemRef}`));
    const ctx = await deps.repo.mediaContext(articleId);
    if (!ctx) return err(stepError.notFound(`matéria ${articleId} não encontrada`));
    const next = [nextMessage(msg, "rules", msg.itemRef)];
    if (ctx.hasMedia) return ok(next);

    const reproductionEnabled = await deps.flags.isEnabled("image_reproduction_enabled");
    const notes: string[] = [];
    const chosen = await sourceImage(ctx, reproductionEnabled, notes);

    const wanted = [...new Set([ctx.sectionSlug, ctx.category, ...ctx.tags])];
    const archive: Candidate[] = (await deps.repo.archiveCandidates(wanted, ARCHIVE_LIMIT))
      .filter((a) => a.width !== null && a.height !== null)
      .map((a) => ({
        url: a.storagePath,
        assetId: a.id,
        width: a.width!,
        height: a.height!,
        fit: a.tags.includes(ctx.sectionSlug) ? 1 : a.tags.includes(ctx.category) ? 0.85 : 0.7,
        phashDistances: [],
        watermark: false,
      }));

    const policy: ImagePolicy = chosen?.item.source.imagePolicy ?? "none";
    const choice = chooseImage({
      sourcePolicy: policy,
      hasAgreement: chosen ? hasAgreement(chosen.item.source.agreementUntil, deps.now()) : false,
      reproductionEnabled,
      ...(chosen ? { original: chosen.candidate } : {}),
      licensed: [],
      archive,
      topicAllowsGenerated: deps.canGenerate === true && mayGenerate(ctx),
      category: ctx.category,
      sensitive: ctx.sensitive,
      tags: ctx.tags,
    });

    let mediaId: string | null = null;
    if ((choice.kind === "original" || choice.kind === "reproduction") && chosen) {
      if (chosen.existing) mediaId = chosen.existing.id;
      else if (chosen.download) {
        const { bytes, analysis } = chosen.download;
        const path = mediaPath(choice.kind, analysis.sha256, analysis.format);
        const put = await deps.store.put(path, bytes, analysis.contentType);
        if (!put.ok) return err(stepError.transient(`Storage: ${put.error}`, { articleId, path }));
        const s = chosen.item.source;
        mediaId = await deps.repo.insertAsset({
          kind: choice.kind,
          storagePath: put.value.path,
          originUrl: chosen.candidate.imageUrl ?? chosen.item.pageUrl,
          pageUrl: chosen.item.pageUrl,
          sourceId: s.id,
          sourceName: s.name,
          author: chosen.candidate.author ?? null,
          license:
            choice.kind === "reproduction"
              ? REPRODUCTION_LICENSE
              : `Acordo com ${s.name} vigente até ${s.agreementUntil ?? "?"}.`,
          credit: chosen.candidate.author ?? null,
          allowedUse: choice.kind === "reproduction" ? `article:${articleId}` : "editorial",
          width: analysis.width,
          height: analysis.height,
          phash: analysis.phash,
          sha256: analysis.sha256,
          contentType: analysis.contentType,
          risk: choice.kind === "reproduction" ? "medio" : "baixo",
          provenance: {
            policy: s.imagePolicy,
            sourceSlug: s.slug,
            itemId: chosen.item.itemId,
            imageUrl: chosen.candidate.imageUrl,
            pageUrl: chosen.item.pageUrl,
            fetchedAt: deps.now().toISOString(),
            userAgent: deps.userAgent,
            bytes: analysis.bytes,
            sha256: analysis.sha256,
            unmodified: true,
          },
        });
      }
    } else if (choice.kind === "illustrative" || choice.kind === "licensed") {
      mediaId = choice.asset?.assetId ?? null;
    }

    const rationale = [choice.rationale, ...notes].join(" ");
    if (mediaId) await deps.repo.linkArticleMedia(articleId, mediaId, rationale, "pipeline:image");
    await deps.repo.recordDecision({
      objectRef: msg.itemRef,
      step: "image",
      agentId: null,
      promptVersion: null,
      inputHash: inputHash("image", articleId, mediaId, choice.kind),
      output: {
        kind: choice.kind,
        mediaId,
        label: imageLabel(choice),
        credit: choice.credit,
        reproductionEnabled,
      },
      rationale,
    });
    return ok(next);
  };
}
