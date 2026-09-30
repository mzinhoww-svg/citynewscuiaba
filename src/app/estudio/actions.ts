"use server";

import { redirect } from "next/navigation";
import {
  CORRECTIONS_TEXT,
  IMAGE_TEXT,
  EDITOR_TEXT,
  MEDIA_TEXT,
  MODERATION_TEXT,
  PUBLISH_TEXT,
  QUEUE_TEXT,
  REVIEW_TEXT,
} from "@/content/pt-BR/studio";
import {
  openCorrection,
  publishCorrection,
  publishUpdate,
  type PublishCorrectionInput,
  type PublishUpdateInput,
} from "@/lib/studio/corrections";
import type { GenerateReply, PublishReply } from "@/components";
import { PUSH_ADMIN_TEXT } from "@/content/pt-BR/notifications-admin";
import { createServerClient } from "@/lib/db/client";
import { createPushAdminStore } from "@/lib/db/push-admin-store";
import { formatDateTime } from "@/lib/format/date";
import { BODY_MAX, sanitizeNotificationText, TITLE_MAX } from "@/lib/push/text";
import { PUSH_ADMIN_PATH } from "./nav";
import type { StudioResult } from "@/lib/studio/action";
import {
  approveImage,
  blockExpired,
  blockImage,
  generateIllustration,
  renewLicense,
  replaceImage,
  setImageText,
  takedownImage,
  type ImageTextInput,
} from "@/lib/studio/media";
import { approveSubmission, rejectSubmission, respondReport } from "@/lib/studio/moderation";
import { publishArticle } from "@/lib/studio/publish";
import { rejectItem, reprocessItem, requestChanges, updateSources } from "@/lib/studio/review";
import {
  acceptSuggestion,
  rejectSuggestion,
  saveDraft,
  type ConflictData,
  type SaveInput,
} from "@/lib/studio/save";
import {
  assign,
  requestReview,
  unpublishAuto,
  unpublishAutoBatch,
  type BatchOutcome,
} from "@/lib/studio/queue";

/*
 * Server Actions do Estúdio: camada fina sobre src/lib/studio (guarda de papel, auditoria e
 * versão ficam lá). Devolvem texto pronto para a região de status da tela.
 */

export interface ActionReply {
  ok: boolean;
  message: string;
}

function reply<O>(r: StudioResult<O>, success: string): ActionReply {
  if (r.ok) return { ok: true, message: success };
  if (r.message) return { ok: false, message: r.message };
  return {
    ok: false,
    message: r.error === "forbidden" ? QUEUE_TEXT.forbidden : QUEUE_TEXT.genericError,
  };
}

function batchReply(out: BatchOutcome, success: (n: number) => string): ActionReply {
  const parts = [];
  if (out.done.length > 0) parts.push(success(out.done.length));
  if (out.failed.length > 0) {
    parts.push(QUEUE_TEXT.failedSome(out.failed.length));
    const why = out.failed.find((f) => f.message)?.message;
    if (why) parts.push(why);
    else if (out.failed.some((f) => f.error === "forbidden")) parts.push(QUEUE_TEXT.forbidden);
  }
  return { ok: out.failed.length === 0, message: parts.join(". ") };
}

export async function unpublishAutoAction(input: {
  id: string;
  title: string;
  reason: string;
}): Promise<ActionReply> {
  const r = await unpublishAuto({ id: input.id, reason: input.reason });
  return reply(r, QUEUE_TEXT.unpublished(input.title));
}

export async function assignAction(input: {
  ids: string[];
  userId: string | null;
}): Promise<ActionReply> {
  return batchReply(await assign(input), QUEUE_TEXT.assigned);
}

export async function requestReviewAction(input: { ids: string[] }): Promise<ActionReply> {
  return batchReply(await requestReview(input), QUEUE_TEXT.reviewRequested);
}

export async function unpublishManyAction(input: {
  ids: string[];
  reason: string;
}): Promise<ActionReply> {
  if (!input.reason.trim()) return { ok: false, message: QUEUE_TEXT.reasonRequired };
  return batchReply(await unpublishAutoBatch(input), QUEUE_TEXT.unpublishedMany);
}

export type SaveReply =
  | { ok: true; message: string; version: number }
  | { ok: false; message: string; conflict?: ConflictData };

export async function saveDraftAction(input: {
  id: string;
  baseVersion: number;
  doc: unknown;
}): Promise<SaveReply> {
  const r = await saveDraft(input as SaveInput);
  if (r.ok)
    return {
      ok: true,
      message: r.value.unscheduled
        ? EDITOR_TEXT.unscheduled(r.value.version)
        : EDITOR_TEXT.saved(r.value.version),
      version: r.value.version,
    };
  if (r.error === "conflict")
    return {
      ok: false,
      message: r.message ?? EDITOR_TEXT.conflict,
      conflict: r.data as ConflictData,
    };
  return { ok: false, message: reply(r, "").message };
}

export async function acceptSuggestionAction(input: {
  id: string;
  articleId: string;
  baseVersion: number;
}): Promise<ActionReply> {
  const r = await acceptSuggestion(input);
  if (!r.ok && r.error === "conflict") return { ok: false, message: EDITOR_TEXT.conflict };
  return reply(r, EDITOR_TEXT.applied);
}

export async function rejectSuggestionAction(input: {
  id: string;
  articleId: string;
}): Promise<ActionReply> {
  return reply(await rejectSuggestion(input), EDITOR_TEXT.discarded);
}

export async function updateSourcesAction(input: {
  id: string;
  sources: { itemId: string; role: "primary" | "secondary" | "context"; confirmed: boolean }[];
}): Promise<ActionReply> {
  return reply(await updateSources(input), EDITOR_TEXT.sourcesSaved);
}

/**
 * Aprovar e publicar da revisão (E03). `baseVersion` vem ligado pela página (`.bind`): publica
 * a versão que a pessoa revisou; se alguém salvou depois, é conflito.
 */
export async function approveAction(
  baseVersion: number,
  input: { id: string },
): Promise<ActionReply> {
  return reply(
    await publishArticle({ id: input.id, when: "now", baseVersion }),
    REVIEW_TEXT.approved,
  );
}

export async function rejectItemAction(input: {
  id: string;
  reason: string;
}): Promise<ActionReply> {
  return reply(await rejectItem(input), REVIEW_TEXT.rejected);
}

export async function requestChangesAction(input: {
  id: string;
  reason: string;
}): Promise<ActionReply> {
  return reply(await requestChanges(input), REVIEW_TEXT.changesRequested);
}

export async function reprocessAction(input: { id: string }): Promise<ActionReply> {
  return reply(await reprocessItem(input), REVIEW_TEXT.reprocessed);
}

/**
 * E06: publica e, com "Push urgente" marcado (admin ou editor-chefe), cria o pedido Urgente em A09
 * já preenchido com título e linha fina da matéria (spec 2026-09-28 §10.7). A justificativa é
 * conferida antes de publicar; a falha do pedido não desfaz a publicação e vira mensagem.
 */
export async function publishAction(
  baseVersion: number,
  input: {
    id: string;
    when: "now" | { at: string };
    destinations: ("home" | "section" | "topic" | "newsletter")[];
    push?: { justification: string };
  },
): Promise<PublishReply> {
  const { push, ...rest } = input;
  const justification = push?.justification?.trim() ?? "";
  if (push) {
    if (!justification || justification.length > 300)
      return { ok: false, message: PUBLISH_TEXT.pushJustificationRequired };
    if (rest.when !== "now")
      return { ok: false, message: PUSH_ADMIN_TEXT.errors.schedule.urgent_now_only };
  }
  const r = await publishArticle({ ...rest, baseVersion });
  if (r.ok && r.value.status === "scheduled" && r.value.scheduledFor)
    return { ok: true, message: PUBLISH_TEXT.scheduled(formatDateTime(r.value.scheduledFor)) };
  if (!r.ok || !push) return reply(r, PUBLISH_TEXT.published);

  const outcome = await requestUrgentPush(rest.id, justification);
  if (outcome.ok)
    return {
      ok: true,
      message: `${PUBLISH_TEXT.published}. ${PUBLISH_TEXT.pushRequested}`,
      pushQueueHref: `${PUSH_ADMIN_PATH}/fila`,
    };
  return { ok: true, message: PUBLISH_TEXT.pushFailed(PUSH_ADMIN_TEXT.errors[outcome.error]) };
}

async function requestUrgentPush(articleId: string, justification: string) {
  const db = await createServerClient();
  const { data: a } = await db
    .from("articles")
    .select("title, dek")
    .eq("id", articleId)
    .maybeSingle();
  if (!a) return { ok: false as const, error: "article_invalid" as const };
  return createPushAdminStore(db).request({
    kind: "urgent",
    articleId,
    title: sanitizeNotificationText(a.title, TITLE_MAX),
    body: sanitizeNotificationText(a.dek, BODY_MAX),
    audience: { type: "all" },
    when: { type: "now" },
    justification,
  });
}

function conflictOr(r: StudioResult<unknown>): SaveReply {
  if (!r.ok && r.error === "conflict")
    return {
      ok: false,
      message: r.message ?? EDITOR_TEXT.conflict,
      conflict: r.data as ConflictData,
    };
  return { ok: false, message: reply(r, "").message };
}

export async function publishCorrectionAction(input: {
  id: string;
  baseVersion: number;
  doc: unknown;
  publicNote: string;
  notifySavers: boolean;
}): Promise<SaveReply> {
  const r = await publishCorrection(input as PublishCorrectionInput);
  if (r.ok)
    return {
      ok: true,
      message: CORRECTIONS_TEXT.published(r.value.notified),
      version: r.value.version,
    };
  return conflictOr(r);
}

export async function publishUpdateAction(input: {
  id: string;
  baseVersion: number;
  doc: unknown;
  publicNote: string;
}): Promise<SaveReply> {
  const r = await publishUpdate(input as PublishUpdateInput);
  if (r.ok)
    return {
      ok: true,
      message: CORRECTIONS_TEXT.updated(r.value.version),
      version: r.value.version,
    };
  return conflictOr(r);
}

/** Editor de matéria publicada → abre um pedido de correção da redação e vai para a tela dele. */
export async function openCorrectionAction(formData: FormData): Promise<void> {
  const articleId = String(formData.get("articleId") ?? "");
  const r = await openCorrection({ articleId, kind: "correction", requestedBy: "redação" });
  if (r.ok) redirect(`/estudio/correcoes/${r.value.id}`);
  redirect(`/estudio/materias/${articleId}?erro=correcao`);
}

export async function approveImageAction(input: { id: string }): Promise<ActionReply> {
  return reply(await approveImage(input), MEDIA_TEXT.approved);
}

export async function setImageTextAction(input: ImageTextInput): Promise<ActionReply> {
  return reply(await setImageText(input), IMAGE_TEXT.saved);
}

export async function takedownImageAction(input: {
  id: string;
  reason: string;
  allFromSource: boolean;
}): Promise<ActionReply> {
  return reply(await takedownImage(input), MEDIA_TEXT.takedownDone);
}

export async function blockImageAction(input: {
  id: string;
  reason: string;
}): Promise<ActionReply> {
  return reply(await blockImage(input), MEDIA_TEXT.blocked);
}

export async function replaceImageAction(input: {
  articleId: string;
  mediaId: string;
}): Promise<ActionReply> {
  return reply(await replaceImage(input), MEDIA_TEXT.replaced);
}

export async function renewLicenseAction(input: {
  license: string;
  until: string;
}): Promise<ActionReply> {
  return reply(await renewLicense(input), MEDIA_TEXT.renewed);
}

export async function blockExpiredAction(input: { license: string }): Promise<ActionReply> {
  const r = await blockExpired(input);
  return reply(r, r.ok ? MEDIA_TEXT.blockedExpired(r.value.count) : "");
}

export async function suggestIllustrationAction(input: {
  articleId: string;
}): Promise<GenerateReply> {
  const r = await generateIllustration(input);
  if (r.ok)
    return {
      ok: true,
      prompt: r.value.prompt,
      alt: r.value.alt,
      restrictions: r.value.restrictions,
      generatorAvailable: r.value.generatorAvailable,
    };
  return { ok: false, message: reply(r, "").message };
}

export async function approveSubmissionAction(input: {
  id: string;
  edits: {
    title: string;
    startsAt: string;
    venue: string;
    category: string;
    description: string | null;
  };
}): Promise<ActionReply> {
  const r = await approveSubmission(input as Parameters<typeof approveSubmission>[0]);
  return reply(r, MODERATION_TEXT.approved);
}

export async function rejectSubmissionAction(input: {
  id: string;
  reason: string;
}): Promise<ActionReply> {
  return reply(await rejectSubmission(input), MODERATION_TEXT.rejected);
}

export async function respondReportAction(input: {
  id: string;
  response: string;
}): Promise<ActionReply> {
  return reply(await respondReport(input), MODERATION_TEXT.answered);
}

/** Denúncia de informação errada ou direito de resposta → pedido de correção vinculado. */
export async function correctionFromReportAction(formData: FormData): Promise<void> {
  const articleId = String(formData.get("articleId") ?? "");
  const reportId = String(formData.get("reportId") ?? "");
  const kind = formData.get("kind") === "right_of_reply" ? "right_of_reply" : "correction";
  const r = await openCorrection({ articleId, kind, requestedBy: "leitor", reportId });
  if (r.ok) redirect(`/estudio/correcoes/${r.value.id}`);
  redirect("/estudio/denuncias?erro=correcao");
}
