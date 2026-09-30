/**
 * Porta do envio (spec 2026-09-28 §12): o que os jobs `push_match`, `push_deliver` e `push_due`
 * precisam do banco. Implementação real em `src/lib/db/push-send-store.ts` (service role);
 * em memória em `./memory-store.ts` (testes).
 */
import type { Audience, PushKind, ReserveOutcome, SendStatus, TargetKey } from "../types";

export interface PushArticle {
  id: string;
  slug: string;
  status: string;
  title: string;
  dek: string;
  urgent: boolean;
  sponsored: boolean;
  publishMode: "human" | "auto" | null;
  sectionSlug: string;
  topicSlug: string | null;
  neighborhoods: string[];
  sourceSlugs: string[];
  /** Rótulo principal da matéria (D-P18). */
  originLabel: string;
}

export interface PushSend {
  id: string;
  kind: PushKind;
  articleId: string;
  title: string;
  body: string;
  originLabel: string;
  url: string;
  tag: string;
  audience: Audience;
  status: SendStatus;
  batchesTotal: number;
  batchesDone: number;
  startedAt: string | null;
}

export interface DeliverySub {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface DueDelivery {
  id: number;
  subscription: DeliverySub;
  attempts: number;
  /** Adiada pelo silêncio (`follow` agrupado sai com a tag `follow`). */
  deferred: boolean;
}

/** Entrega `queued` sem resultado há mais que isto é órfã (worker caiu depois do `reserve`, PWA-08). */
export const ORPHAN_AFTER_MS = 3 * 60_000;

export type DeliveryOutcome = "accepted" | "gone" | "retry" | "failed";
export type ClaimOutcome = "ok" | "skipped_limit" | "expired" | "coalesced" | "gone";

export interface PushSendStore {
  paused(): Promise<boolean>;
  articleForPush(id: string): Promise<PushArticle | null>;
  /** Cria (ou devolve) o envio `follow` da matéria; `null` quando não cabe (urgente, patrocinada). */
  ensureFollowSend(a: PushArticle, notBefore: string | null): Promise<PushSend | null>;
  getSend(id: string): Promise<PushSend | null>;
  /**
   * Fan-out em lotes (faixas de `id` de inscrição): grava `push_batches` e `batches_total`,
   * põe o envio em `dispatching` e devolve o número de lotes (0 = nada a enviar, já `sent`).
   */
  planBatches(
    sendId: string,
    targets: TargetKey[] | null,
    audience: Audience,
    kind: PushKind,
    pageSize?: number,
    batchSize?: number,
  ): Promise<number>;
  batchSubscriptions(
    sendId: string,
    batchNo: number,
  ): Promise<{ status: string; subs: DeliverySub[] }>;
  reserve(
    subId: string,
    sendId: string,
    now: Date,
  ): Promise<{ outcome: ReserveOutcome | "gone"; deliveryId: number | null }>;
  deliveryResult(
    id: number,
    outcome: DeliveryOutcome,
    http: number | null,
    error: string | null,
    retryAt: string | null,
  ): Promise<void>;
  finishBatch(sendId: string, batchNo: number): Promise<{ allDone: boolean }>;
  pauseSend(sendId: string, reason: string): Promise<void>;
  cancelSend(sendId: string, reason: string): Promise<void>;
  pauseBatch(sendId: string, batchNo: number): Promise<void>;
  dueDeliveries(sendId: string, now: Date, limit?: number): Promise<DueDelivery[]>;
  claimDue(deliveryId: number, now: Date): Promise<ClaimOutcome>;
  /** Expira as entregas `queued`/`deferred` do envio (matéria despublicada ou patrocinada, PWA-01). */
  expirePending(sendId: string): Promise<void>;
  notifyVapidInvalid(sendId: string): Promise<void>;
}
