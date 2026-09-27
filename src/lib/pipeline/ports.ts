/**
 * Portas do pipeline: o domínio conversa com fila, banco e rede só por estas interfaces.
 * Implementações reais em `queue.ts` e `src/lib/db/pipeline-store.ts`; falsas em `testing/`.
 */
import type { PipelineMessage, QueueName, StepName } from "./types";

export interface QueuedMessage {
  msgId: number;
  /** Quantas vezes a mensagem foi lida, contando esta leitura. */
  readCt: number;
  msg: PipelineMessage;
}

/**
 * Fila do pipeline (ADR-004 com o contorno de docs/AUTONOMY.md §4): tabela `jobs` com
 * `for update skip locked`, visibilidade e contagem de leituras, igual ao pgmq.
 */
export interface Queue {
  /** `false` quando a mesma etapa do mesmo item já está na fila. */
  enqueue(queue: QueueName, msg: PipelineMessage, opts?: { delaySec?: number }): Promise<boolean>;
  readBatch(queue: QueueName, n: number, vtSec: number): Promise<QueuedMessage[]>;
  ack(queue: QueueName, msgId: number): Promise<void>;
  /** Reagenda para nova tentativa depois de `delaySec`. */
  fail(queue: QueueName, msgId: number, error: string, delaySec: number): Promise<void>;
  /** Devolve uma mensagem lida e não processada; não conta como tentativa. */
  release(queue: QueueName, msgId: number): Promise<void>;
  quarantine(queue: QueueName, item: Pick<QueuedMessage, "msgId">, error: string): Promise<void>;
  /** Move para a quarentena mensagens com `read_ct >= maxReads` que voltaram a ficar visíveis. */
  moveExhausted(queue: QueueName, maxReads: number): Promise<number>;
  pending(
    queue: QueueName,
    filter?: { runId?: string; steps?: readonly StepName[] },
  ): Promise<number>;
}

export type EventLevel = "info" | "warn" | "error" | "security";

export interface PipelineEvent {
  runId: string | null;
  step: StepName;
  itemRef: string | null;
  level: EventLevel;
  message: string;
  details?: Record<string, unknown>;
}

/** Etapa 18 (registrar): `pipeline_events`, append-only. */
export interface EventSink {
  record(events: PipelineEvent[]): Promise<void>;
}

export interface DueSource {
  slug: string;
  frequencyMinutes: number;
  lastFetchedAt: string | null;
}

export interface RunStore {
  /** Um run por janela: a segunda chamada na mesma janela devolve o run existente. */
  startRun(windowStart: Date): Promise<{ runId: string; created: boolean; fetchEnqueued: boolean }>;
  markFetchEnqueued(runId: string, count: number): Promise<void>;
  /** Run anterior ainda aberto (status `running`), se houver. */
  previousOpenRun(windowStart: Date): Promise<string | null>;
  activeSources(): Promise<DueSource[]>;
}
