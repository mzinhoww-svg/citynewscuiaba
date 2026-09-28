"use server";

import { QUEUE_TEXT } from "@/content/pt-BR/studio";
import type { StudioResult } from "@/lib/studio/action";
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
