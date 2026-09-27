import { isCronAuthorized, unauthorized } from "@/lib/security/cron-auth";
import type { EventSink, PipelineEvent, Queue, QueuedMessage } from "./ports";
import { MAX_ATTEMPTS, retryPolicy } from "./retry";
import { stepError, type RunStep, type StepError } from "./run-step";
import { QUEUE_NAMES, queueFor, type QueueName } from "./types";

/** Igual ao `maxDuration` da rota /api/jobs/drain (limite do Vercel Hobby). */
export const DRAIN_MAX_DURATION_SEC = 60;
/** O drain para de pegar trabalho em 80% do tempo e devolve o restante à fila (ADR-004). */
export const DRAIN_BUDGET_RATIO = 0.8;
export const DRAIN_BATCH_SIZE = 10;
/** Visibilidade de uma mensagem lida (ADR-004): maior que o `maxDuration`. */
export const DRAIN_VISIBILITY_SEC = 120;

export interface DrainDeps {
  queue: Queue;
  runStep: RunStep;
  events: EventSink;
  /** Relógio em ms (injetável nos testes). */
  now: () => number;
  budgetMs?: number;
  batchSize?: number;
  vtSec?: number;
  queues?: readonly QueueName[];
}

export interface DrainResult {
  processed: number;
  succeeded: number;
  retried: number;
  quarantined: number;
  released: number;
  exhausted: number;
  remaining: number;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function event(
  q: QueuedMessage,
  level: PipelineEvent["level"],
  message: string,
  details: Record<string, unknown> = {},
): PipelineEvent {
  const runId = UUID.test(q.msg.runId) ? q.msg.runId : null;
  return {
    runId,
    step: q.msg.step,
    itemRef: q.msg.itemRef,
    level,
    message,
    details: { attempt: q.readCt, ...(runId ? {} : { runRef: q.msg.runId }), ...details },
  };
}

/**
 * Worker: lê lotes, executa a etapa, enfileira as próximas e confirma. Falha transitória reagenda
 * com 1, 4 e 10 min; esgotada ou não recuperável, quarentena. Ao atingir 80% do tempo, devolve
 * as mensagens lidas e não processadas. Toda execução fica em `pipeline_events`.
 */
export async function drain(deps: DrainDeps): Promise<DrainResult> {
  const { queue, runStep, now } = deps;
  const start = now();
  const deadline = start + (deps.budgetMs ?? DRAIN_MAX_DURATION_SEC * 1000 * DRAIN_BUDGET_RATIO);
  const batchSize = deps.batchSize ?? DRAIN_BATCH_SIZE;
  const vtSec = deps.vtSec ?? DRAIN_VISIBILITY_SEC;
  const queues = deps.queues ?? QUEUE_NAMES;
  const r: DrainResult = {
    processed: 0,
    succeeded: 0,
    retried: 0,
    quarantined: 0,
    released: 0,
    exhausted: 0,
    remaining: 0,
  };
  const log: PipelineEvent[] = [];

  try {
    for (const name of queues) r.exhausted += await queue.moveExhausted(name, MAX_ATTEMPTS);

    // Uma etapa pode enfileirar a próxima em outra fila (queueFor): repete a volta pelas filas
    // até nenhuma ter mensagem pronta ou o tempo acabar.
    outer: while (now() < deadline) {
      let progressed = false;
      for (const name of queues) {
        while (now() < deadline) {
          const batch = await queue.readBatch(name, batchSize, vtSec);
          if (batch.length === 0) break;
          progressed = true;
          for (let i = 0; i < batch.length; i++) {
            const q = batch[i]!;
            if (now() >= deadline) {
              for (const rest of batch.slice(i)) await queue.release(name, rest.msgId);
              r.released += batch.length - i;
              break outer;
            }
            r.processed++;
            const res = await runStep(q.msg);
            let e: StepError;
            if (res.ok) {
              try {
                for (const next of res.value) await queue.enqueue(queueFor(next.step), next);
                await queue.ack(name, q.msgId);
                r.succeeded++;
                log.push(event(q, "info", "ok", { next: res.value.length }));
                continue;
              } catch (ex) {
                // Etapa feita, próxima não enfileirada: a mensagem volta como falha transitória
                // (as etapas são idempotentes e devolvem a próxima de novo), sem abortar o lote.
                e = stepError.transient(
                  `falha ao enfileirar a próxima etapa: ${ex instanceof Error ? ex.message : String(ex)}`,
                );
              }
            } else e = res.error;
            const decision = retryPolicy(q.readCt, { retryable: e.retryable });
            const details = { kind: e.kind, ...(e.details ?? {}) };
            if (decision.action === "retry") {
              await queue.fail(name, q.msgId, `${e.kind}: ${e.message}`, decision.delaySec);
              r.retried++;
              log.push(event(q, "warn", e.message, { ...details, retryInSec: decision.delaySec }));
            } else {
              await queue.quarantine(name, q, `${e.kind}: ${e.message}`);
              r.quarantined++;
              log.push(event(q, e.kind === "injection" ? "security" : "error", e.message, details));
            }
          }
        }
      }
      if (!progressed) break;
    }
  } finally {
    if (log.length > 0) await deps.events.record(log);
  }

  for (const name of queues) r.remaining += await queue.pending(name);
  return r;
}

export async function handleDrain(
  req: Request,
  deps: DrainDeps & { secret: string | undefined },
): Promise<Response> {
  if (!isCronAuthorized(req.headers.get("authorization"), deps.secret)) return unauthorized();
  return Response.json(await drain(deps));
}
