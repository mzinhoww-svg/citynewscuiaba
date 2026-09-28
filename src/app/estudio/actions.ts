"use server";

import { EDITOR_TEXT, PUBLISH_TEXT, QUEUE_TEXT, REVIEW_TEXT } from "@/content/pt-BR/studio";
import { formatDateTime } from "@/lib/format/date";
import type { StudioResult } from "@/lib/studio/action";
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
    return { ok: true, message: EDITOR_TEXT.saved(r.value.version), version: r.value.version };
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

export async function approveAction(input: { id: string }): Promise<ActionReply> {
  return reply(await publishArticle({ id: input.id, when: "now" }), REVIEW_TEXT.approved);
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

export async function publishAction(input: {
  id: string;
  when: "now" | { at: string };
  destinations: ("home" | "section" | "topic" | "newsletter")[];
}): Promise<ActionReply> {
  const r = await publishArticle(input);
  if (r.ok && r.value.status === "scheduled" && r.value.scheduledFor)
    return { ok: true, message: PUBLISH_TEXT.scheduled(formatDateTime(r.value.scheduledFor)) };
  return reply(r, PUBLISH_TEXT.published);
}
