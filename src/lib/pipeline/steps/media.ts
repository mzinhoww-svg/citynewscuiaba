import { LABEL_TEXT } from "@/lib/labels";
import { META_SEPARATOR } from "@/content/pt-BR/labels";
import {
  DUPLICATE_MAX_DISTANCE,
  checkImage,
  isSensationalText,
  watermarkHint,
} from "@/lib/media/checks";
import { chooseImage, mayGenerate } from "@/lib/media/choose";
import { inlinePosition, pickCoverAndInline, scoreImage } from "@/lib/media/score";
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

/** Imagens de fonte avaliadas por matéria (capa e imagem do texto saem delas), no máximo. */
const MAX_SOURCE_IMAGES = 4;
const AUTO_CHOSEN_BY = "pipeline:image";
const ARCHIVE_LIMIT = 12;
const ARTICLE_REF = /^article:(\S+)$/;

export const REPRODUCTION_LICENSE =
  "Reprodução da imagem da matéria original (política reproduction, A-010): rótulo REPRODUÇÃO, crédito e link obrigatórios, sem recorte, remoção em 24 h a pedido.";

interface Prepared {
  item: MediaSourceItem;
  /** Como a política da fonte permite usar a imagem. */
  use: "original" | "reproduction";
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
    signal: AbortSignal | undefined,
    use: Prepared["use"],
  ): Promise<Result<Prepared, string>> => {
    const existing = await deps.repo.assetByOrigin(imageUrl);
    if (existing?.status === "blocked") return err("imagem removida a pedido");
    const base = {
      url: item.pageUrl,
      imageUrl,
      sourceId: item.source.id,
      sourceName: item.source.name,
      ...(item.author?.trim() ? { author: item.author.trim() } : {}),
      fit: 1,
      watermark: watermarkHint(imageUrl),
      sensational: isSensationalText(item.title),
    };
    if (existing && existing.width !== null && existing.height !== null)
      return ok({
        item,
        use,
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
      {
        bucket: `crawler:${item.source.slug}`,
        limitPerHour: item.source.rateLimitPerHour,
        signal,
      },
    );
    if (robots.kind !== "allowed")
      return err(robots.kind === "rate_limited" ? "limite de requisições da fonte" : robots.reason);
    const file = await fetchImage(deps, imageUrl, {
      sourceBaseUrl: item.source.baseUrl,
      signal,
    });
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
      use,
      existing: null,
      download: { bytes: file.value.bytes, analysis: analysis.value },
      candidate: {
        ...base,
        width: analysis.value.width,
        height: analysis.value.height,
        phashDistances: distances,
        phash: analysis.value.phash,
        ...(analysis.value.sharpness !== undefined ? { sharpness: analysis.value.sharpness } : {}),
      },
    });
  };

  /**
   * Avalia até `MAX_SOURCE_IMAGES` imagens de fontes diferentes do assunto (política, flag,
   * `robots.txt` e limite da fonte como sempre) e devolve as que passam em `checkImage`. Uma
   * fonte que já tem imagem aprovada não gasta outra tentativa. `skip` tira da disputa a capa
   * que a matéria já tem (mesma fonte ou mesma imagem).
   */
  const sourceImages = async (
    ctx: MediaContext,
    reproductionEnabled: boolean,
    notes: string[],
    signal: AbortSignal | undefined,
    skip?: { sourceId: string | null; originUrl: string | null },
  ): Promise<Prepared[]> => {
    const now = deps.now();
    let tried = 0;
    let reproductionOff = false;
    const passed: Prepared[] = [];
    const doneSources = new Set<string>();
    for (const item of ctx.items) {
      if (!item.imageUrl) continue;
      if (skip?.sourceId && item.source.id === skip.sourceId) continue;
      if (skip?.originUrl && item.imageUrl === skip.originUrl) continue;
      if (doneSources.has(item.source.id)) continue;
      const use = usableAs(item, reproductionEnabled, now);
      if (!use) {
        if (item.source.imagePolicy === "reproduction") reproductionOff = true;
        continue;
      }
      if (tried++ >= MAX_SOURCE_IMAGES) break;
      const p = await prepare(item, item.imageUrl, signal, use);
      if (!p.ok) {
        notes.push(`${item.source.name}: ${p.error}.`);
        continue;
      }
      const check = checkImage(p.value.candidate, use);
      if (!check.ok) {
        notes.push(`${item.source.name}: imagem reprovada (${check.issues.join(", ")}).`);
        continue;
      }
      passed.push(p.value);
      doneSources.add(item.source.id);
    }
    if (reproductionOff) notes.push("Imagem da fonte não usada: reprodução desligada.");
    return passed;
  };

  /** Copia o arquivo para o Storage e cria o ativo (ou reaproveita o da mesma origem). */
  const saveAsset = async (
    p: Prepared,
    kind: "original" | "reproduction",
    articleId: string,
  ): Promise<Result<string, ReturnType<typeof stepError.transient>>> => {
    if (p.existing) return ok(p.existing.id);
    if (!p.download) return err(stepError.transient("imagem sem arquivo", { articleId }));
    const { bytes, analysis } = p.download;
    const path = mediaPath(kind, analysis.sha256, analysis.format);
    const put = await deps.store.put(path, bytes, analysis.contentType);
    if (!put.ok) return err(stepError.transient(`Storage: ${put.error}`, { articleId, path }));
    const s = p.item.source;
    const id = await deps.repo.insertAsset({
      kind,
      storagePath: put.value.path,
      originUrl: p.candidate.imageUrl ?? p.item.pageUrl,
      pageUrl: p.item.pageUrl,
      sourceId: s.id,
      sourceName: s.name,
      author: p.candidate.author ?? null,
      license:
        kind === "reproduction"
          ? REPRODUCTION_LICENSE
          : `Acordo com ${s.name} vigente até ${s.agreementUntil ?? "?"}.`,
      credit: p.candidate.author ?? null,
      allowedUse: kind === "reproduction" ? `article:${articleId}` : "editorial",
      width: analysis.width,
      height: analysis.height,
      phash: analysis.phash,
      sha256: analysis.sha256,
      contentType: analysis.contentType,
      risk: kind === "reproduction" ? "medio" : "baixo",
      provenance: {
        policy: s.imagePolicy,
        sourceSlug: s.slug,
        itemId: p.item.itemId,
        imageUrl: p.candidate.imageUrl,
        pageUrl: p.item.pageUrl,
        fetchedAt: deps.now().toISOString(),
        userAgent: deps.userAgent,
        bytes: analysis.bytes,
        sha256: analysis.sha256,
        unmodified: true,
      },
    });
    return ok(id);
  };

  return async (msg, step) => {
    const articleId = ARTICLE_REF.exec(msg.itemRef)?.[1];
    if (!articleId) return err(stepError.invalid(`referência inválida: ${msg.itemRef}`));
    const ctx = await deps.repo.mediaContext(articleId);
    if (!ctx) return err(stepError.notFound(`matéria ${articleId} não encontrada`));
    const next = [nextMessage(msg, "rules", msg.itemRef)];
    // Escolha de pessoa e matéria editada por pessoa nunca são tocadas (reprocesso idempotente).
    if (ctx.humanMedia || ctx.humanEdited) return ok(next);

    const position = inlinePosition(ctx.bodyParagraphs);
    const coverFromSource =
      ctx.cover !== null && (ctx.cover.kind === "original" || ctx.cover.kind === "reproduction");
    const wantCover = ctx.cover === null;
    // A imagem do texto só vem de fonte, ao lado de uma capa que também veio de fonte, e só entra
    // se o corpo comporta (≥ 2 parágrafos).
    const wantInline = ctx.inline === null && position !== null && (wantCover || coverFromSource);
    if (!wantCover && !wantInline) return ok(next);

    const reproductionEnabled = await deps.flags.isEnabled("image_reproduction_enabled");
    const notes: string[] = [];
    const prepared = await sourceImages(
      ctx,
      reproductionEnabled,
      notes,
      step?.signal,
      ctx.cover ? { sourceId: ctx.cover.sourceId, originUrl: ctx.cover.originUrl } : undefined,
    );
    const byCandidate = new Map(prepared.map((p) => [p.candidate, p]));
    const picked = pickCoverAndInline(
      prepared.map((p) => p.candidate),
      ctx.cover
        ? {
            cover: {
              ...(ctx.cover.sourceId ? { sourceId: ctx.cover.sourceId } : {}),
              ...(ctx.cover.originUrl ? { imageUrl: ctx.cover.originUrl } : {}),
              ...(ctx.cover.phash !== null ? { phash: ctx.cover.phash } : {}),
            },
          }
        : undefined,
    );
    const scores = prepared.map((p) => ({
      source: p.item.source.name,
      score: scoreImage(p.candidate),
    }));
    const chosen = picked.cover ? (byCandidate.get(picked.cover) ?? null) : null;
    const inlineChosen = picked.inline ? (byCandidate.get(picked.inline) ?? null) : null;

    let choice: MediaChoice | null = null;
    let mediaId: string | null = null;
    if (wantCover) {
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
      choice = chooseImage({
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
      if ((choice.kind === "original" || choice.kind === "reproduction") && chosen) {
        const saved = await saveAsset(chosen, choice.kind, articleId);
        if (!saved.ok) return saved;
        mediaId = saved.value;
      } else if (choice.kind === "illustrative" || choice.kind === "licensed") {
        mediaId = choice.asset?.assetId ?? null;
      }
    }

    // Imagem do texto: de outra fonte, outra foto, e só quando a capa também é de fonte.
    const coverIsSource = wantCover
      ? choice?.kind === "original" || choice?.kind === "reproduction"
      : coverFromSource;
    let inlineId: string | null = null;
    if (wantInline && coverIsSource && inlineChosen && position !== null) {
      const saved = await saveAsset(inlineChosen, inlineChosen.use, articleId);
      if (!saved.ok) return saved;
      inlineId = saved.value;
    }

    // Reprocesso que não achou imagem do texto e não precisava de capa: nada mudou, nada a registrar.
    if (!wantCover && !inlineId) return ok(next);

    const rationale = [choice?.rationale, ...notes].filter(Boolean).join(" ");
    if (mediaId && choice)
      await deps.repo.linkArticleMedia(articleId, mediaId, rationale, AUTO_CHOSEN_BY, {
        role: "cover",
      });
    if (inlineId && position !== null)
      await deps.repo.linkArticleMedia(
        articleId,
        inlineId,
        `Imagem do texto: ${inlineChosen!.item.source.name} (outra fonte e outra foto que a capa), depois do parágrafo ${position}.`,
        AUTO_CHOSEN_BY,
        { role: "inline", position },
      );
    const kind = choice?.kind ?? "inline_only";
    await deps.repo.recordDecision({
      objectRef: msg.itemRef,
      step: "image",
      agentId: null,
      promptVersion: null,
      inputHash: inputHash("image", articleId, mediaId, kind, inlineId),
      output: {
        kind,
        mediaId,
        label: choice ? imageLabel(choice) : null,
        credit: choice?.credit ?? null,
        reproductionEnabled,
        cover: mediaId ? { mediaId, score: scoreOf(scores, chosen) } : null,
        inline: inlineId
          ? { mediaId: inlineId, position, score: scoreOf(scores, inlineChosen) }
          : null,
        scores,
      },
      rationale: [rationale, inlineId ? `Imagem do texto gravada (parágrafo ${position}).` : ""]
        .filter(Boolean)
        .join(" "),
    });
    return ok(next);
  };
}

const scoreOf = (scores: { source: string; score: number }[], p: Prepared | null): number | null =>
  p ? (scores.find((x) => x.source === p.item.source.name)?.score ?? null) : null;
