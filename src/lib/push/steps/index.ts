/**
 * Jobs de push na fila `notify` (spec 2026-09-28 §12; PW-T9): `push_match` (fan-out em lotes),
 * `push_deliver` (um lote, concorrência 10) e `push_due` (adiados e retentativas). Toda entrega
 * passa por `push_reserve` no banco; o payload nunca leva dado do leitor.
 */
import type { StepHandlers, StepResult } from "@/lib/pipeline/run-step";
import { stepError } from "@/lib/pipeline/run-step";
import { PUSH_RUN_ID, type PipelineMessage } from "@/lib/pipeline/types";
import { err, ok } from "@/lib/result";
import { buildPayload, FOLLOW_TAG, pushHeaders } from "../payload";
import { articleTargets, retryDelay } from "../rules";
import type { PushSender, SendOutcome } from "../sender";
import type { TargetKey } from "../types";
import type { DeliverySub, PushSend, PushSendStore } from "./store";

export interface PushStepsDeps {
  store: PushSendStore;
  sender: PushSender;
  now: () => Date;
  concurrency?: number;
}

export const DELIVER_CONCURRENCY = 10;
export const BATCH_SIZE = 100;
export const PAGE_SIZE = 500;
export const DUE_LIMIT = 100;
export const UNPUBLISHED_REASON = "Matéria despublicada";
export const SPONSORED_REASON = "Matéria patrocinada";
export const VAPID_INVALID_REASON = "vapid_invalid";
/** 403 em massa (PWA-02): pelo menos 5 inscrições e metade do lote, senão é problema da inscrição. */
export const VAPID_MASS_MIN = 5;
export const VAPID_MASS_RATIO = 0.5;

/** Matéria no ar: `published` ou `updated` (mesma lista do trigger 0044). */
export const isLiveStatus = (status: string): boolean =>
  status === "published" || status === "updated";

const msg = (step: PipelineMessage["step"], itemRef: string): PipelineMessage => ({
  runId: PUSH_RUN_ID,
  step,
  itemRef,
  attempt: 1,
});

/** Mensagens `push_deliver` de um envio com `n` lotes. */
export function deliverMessages(sendId: string, n: number): PipelineMessage[] {
  return Array.from({ length: n }, (_, i) => msg("push_deliver", `push:${sendId}:${i + 1}`));
}

async function mapLimit<T>(
  items: T[],
  limit: number,
  fn: (t: T) => Promise<boolean>,
): Promise<boolean> {
  let stop = false;
  let i = 0;
  const worker = async () => {
    while (!stop && i < items.length) {
      const item = items[i++]!;
      if (!(await fn(item))) stop = true;
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return !stop;
}

type DeliverResult = "done" | "forbidden";

/**
 * Entrega uma inscrição já reservada (`queued`) e grava o resultado. `forbidden` (403) NÃO grava:
 * quem chama decide se é uma inscrição hostil (remove) ou chave VAPID inválida (pausa), PWA-02.
 */
async function deliverOne(
  deps: PushStepsDeps,
  send: PushSend,
  sub: DeliverySub,
  deliveryId: number,
  attempts: number,
  tag: string,
): Promise<DeliverResult> {
  const payload = buildPayload({
    title: send.title,
    body: send.body,
    originLabel: send.originLabel,
    url: send.url,
    tag,
    sendId: send.id,
  });
  if (!payload.ok) {
    await deps.store.deliveryResult(deliveryId, "failed", null, `payload:${payload.error}`, null);
    return "done";
  }
  // O rótulo já vem no corpo do envio quando ele nasce em A09 (`body` sem rótulo) ou no
  // follow (`body` = linha fina): `buildPayload` prefixa uma vez.
  const outcome: SendOutcome = await deps.sender.send(
    sub,
    payload.value,
    pushHeaders(send.kind, tag),
  );
  switch (outcome.kind) {
    case "accepted":
      await deps.store.deliveryResult(deliveryId, "accepted", 201, null, null);
      return "done";
    case "gone":
      await deps.store.deliveryResult(deliveryId, "gone", outcome.status, null, null);
      return "done";
    case "retry": {
      const delay = retryDelay(attempts + 1, outcome.retryAfterSec);
      if (delay === null) {
        await deps.store.deliveryResult(
          deliveryId,
          "failed",
          outcome.status,
          "retries_exhausted",
          null,
        );
        return "done";
      }
      const at = new Date(deps.now().getTime() + delay * 1000).toISOString();
      await deps.store.deliveryResult(
        deliveryId,
        "retry",
        outcome.status,
        `http_${outcome.status ?? "timeout"}`,
        at,
      );
      return "done";
    }
    case "failed":
      if (outcome.vapidInvalid) return "forbidden";
      await deps.store.deliveryResult(
        deliveryId,
        "failed",
        outcome.status,
        `http_${outcome.status}`,
        null,
      );
      return "done";
  }
}

/** Matéria ainda no ar e não patrocinada? Senão cancela o envio e expira as entregas pendentes (PWA-01). */
async function articleStillSendable(deps: PushStepsDeps, send: PushSend): Promise<boolean> {
  const article = await deps.store.articleForPush(send.articleId);
  const reason =
    !article || !isLiveStatus(article.status)
      ? UNPUBLISHED_REASON
      : article.sponsored
        ? SPONSORED_REASON
        : null;
  if (reason === null) return true;
  await deps.store.cancelSend(send.id, reason);
  await deps.store.expirePending(send.id);
  return false;
}

async function fanOut(deps: PushStepsDeps, send: PushSend): Promise<StepResult> {
  const article = await deps.store.articleForPush(send.articleId);
  if (!(await articleStillSendable(deps, send)) || !article) return ok([]);
  const targets: TargetKey[] | null = send.kind === "follow" ? articleTargets(article) : null;
  const n = await deps.store.planBatches(
    send.id,
    targets,
    send.audience,
    send.kind,
    PAGE_SIZE,
    BATCH_SIZE,
  );
  return ok(deliverMessages(send.id, n));
}

export function createPushSteps(
  deps: PushStepsDeps,
): Pick<StepHandlers, "push_match" | "push_deliver" | "push_due"> {
  const concurrency = deps.concurrency ?? DELIVER_CONCURRENCY;
  return {
    async push_match(m) {
      const [kind, id] = m.itemRef.split(":");
      if (!id || (kind !== "article" && kind !== "push"))
        return err(stepError.invalid(`itemRef inválido: ${m.itemRef}`));
      const paused = await deps.store.paused();
      if (kind === "article") {
        const article = await deps.store.articleForPush(id);
        if (!article) return ok([]);
        if (!isLiveStatus(article.status) || article.urgent || article.sponsored) return ok([]);
        const send = await deps.store.ensureFollowSend(article, null);
        if (!send) return ok([]);
        if (paused) {
          await deps.store.pauseSend(send.id, "Envios pausados");
          return ok([]);
        }
        if (send.status !== "dispatching" && send.status !== "queued") return ok([]);
        return fanOut(deps, send);
      }
      const send = await deps.store.getSend(id);
      if (!send) return ok([]);
      if (paused) {
        if (send.status === "dispatching" || send.status === "queued")
          await deps.store.pauseSend(send.id, "Envios pausados");
        return ok([]);
      }
      if (send.status !== "dispatching" && send.status !== "queued") return ok([]);
      if (send.batchesTotal > 0) return ok(deliverMessages(send.id, send.batchesTotal));
      return fanOut(deps, send);
    },

    async push_deliver(m) {
      const parts = m.itemRef.split(":");
      const id = parts[1];
      const batchNo = Number(parts[2]);
      if (parts[0] !== "push" || !id || !Number.isInteger(batchNo) || batchNo < 1)
        return err(stepError.invalid(`itemRef inválido: ${m.itemRef}`));
      const send = await deps.store.getSend(id);
      if (!send) return ok([]);
      if (send.status === "cancelled" || send.status === "expired" || send.status === "rejected")
        return ok([]);
      if (send.status === "paused" || (await deps.store.paused())) {
        await deps.store.pauseBatch(id, batchNo);
        return ok([]);
      }
      const batch = await deps.store.batchSubscriptions(id, batchNo);
      // Lote já concluído (reprocessado depois de uma queda): nada a reenviar.
      if (batch.status === "done") return ok([]);
      // A matéria pode ter sido despublicada ou virado patrocinada depois do fan-out (PWA-01).
      if (!(await articleStillSendable(deps, send))) {
        await deps.store.pauseBatch(id, batchNo);
        return ok([]);
      }
      const now = deps.now();
      let attempted = 0;
      const forbidden: number[] = [];
      await mapLimit(batch.subs, concurrency, async (sub) => {
        // Idempotente pelo índice único: uma inscrição já atendida deste envio vira duplicata.
        const r = await deps.store.reserve(sub.id, send.id, now);
        if (r.outcome !== "ok" || r.deliveryId === null) return true;
        attempted += 1;
        if ((await deliverOne(deps, send, sub, r.deliveryId, 0, send.tag)) === "forbidden")
          forbidden.push(r.deliveryId);
        return true;
      });
      // 403 isolado é inscrição criada com outra chave (ou hostil): remove. Só 403 em massa
      // indica chave VAPID do servidor inválida e pausa o envio (PWA-02).
      if (forbidden.length >= VAPID_MASS_MIN && forbidden.length >= attempted * VAPID_MASS_RATIO) {
        for (const d of forbidden)
          await deps.store.deliveryResult(d, "failed", 403, "http_403", null);
        await deps.store.pauseSend(send.id, VAPID_INVALID_REASON);
        await deps.store.notifyVapidInvalid(send.id);
        await deps.store.pauseBatch(id, batchNo);
        return ok([]);
      }
      for (const d of forbidden) await deps.store.deliveryResult(d, "gone", 403, null, null);
      await deps.store.finishBatch(id, batchNo);
      return ok([]);
    },

    async push_due(m) {
      const [kind, id] = m.itemRef.split(":");
      if (kind !== "due" || !id) return err(stepError.invalid(`itemRef inválido: ${m.itemRef}`));
      const send = await deps.store.getSend(id);
      if (!send) return ok([]);
      if (send.status === "paused" || (await deps.store.paused())) return ok([]);
      // Retentativas e entregas adiadas também param se a matéria saiu do ar (PWA-01).
      if (!(await articleStillSendable(deps, send))) return ok([]);
      const now = deps.now();
      const due = await deps.store.dueDeliveries(id, now, DUE_LIMIT);
      await mapLimit(due, concurrency, async (d) => {
        const claim = await deps.store.claimDue(d.id, now);
        if (claim !== "ok") return true;
        const tag = send.kind === "follow" && d.deferred ? FOLLOW_TAG : send.tag;
        const r = await deliverOne(deps, send, d.subscription, d.id, d.attempts, tag);
        // 403 fora do lote: a inscrição foi criada com outra chave; nunca pausa o envio.
        if (r === "forbidden") await deps.store.deliveryResult(d.id, "gone", 403, null, null);
        return true;
      });
      return ok([]);
    },
  };
}
