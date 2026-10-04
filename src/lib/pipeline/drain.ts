import { isCronAuthorized, unauthorized } from "@/lib/security/cron-auth";
import type { EventSink, PipelineEvent, Queue, QueuedMessage } from "./ports";
import { MAX_ATTEMPTS, retryPolicy } from "./retry";
import { stepError, type RunStep, type StepError } from "./run-step";
import { QUEUE_NAMES, queueFor, type JobStep, type PipelineMessage, type QueueName } from "./types";

/** Igual ao `maxDuration` da rota /api/jobs/drain (limite do Vercel Hobby). */
export const DRAIN_MAX_DURATION_SEC = 60;
/** O drain para de pegar trabalho em 80% do tempo e devolve o restante à fila (ADR-004). */
export const DRAIN_BUDGET_RATIO = 0.8;
export const DRAIN_BATCH_SIZE = 10;
/** Visibilidade de uma mensagem lida (ADR-004): maior que o `maxDuration`. */
export const DRAIN_VISIBILITY_SEC = 120;
/** Folga antes do `maxDuration`: registrar eventos e responder. As etapas são abortadas antes. */
export const DRAIN_SAFETY_MS = 5_000;
/** Eventos acumulados antes de gravar em `pipeline_events` (grava também ao fim de cada lote). */
export const DRAIN_EVENTS_FLUSH = 25;

/**
 * Tempo mínimo que cada etapa precisa (rede com timeout de 10 s, IA com timeout de 20 a 45 s). Sem
 * esse tempo até o limite duro, a mensagem volta à fila sem contar tentativa.
 */
export const STEP_MIN_MS: Partial<Record<JobStep, number>> = {
  fetch: 12_000,
  /** Espera de 1 s + robots.txt (10 s) + página (10 s). */
  enrich: 22_000,
  dedupe: 8_000,
  classify: 15_000,
  locate: 10_000,
  verify: 20_000,
  summarize: 30_000,
  /** Até 2 fontes avaliadas (robots.txt + imagem, 10 s cada) para capa e imagem do texto. */
  image: 30_000,
  index: 8_000,
  /** Lote de até 100 entregas de push com concorrência 10 e 10 s por envio (spec §12.3). */
  push_deliver: 15_000,
  push_due: 15_000,
  /** Lote de até 50 matérias numa chamada só ao banco. */
  forced_publish: 10_000,
};
const DEFAULT_STEP_MIN_MS = 2_000;

export interface DrainDeps {
  queue: Queue;
  runStep: RunStep;
  events: EventSink;
  /** Relógio em ms (injetável nos testes). */
  now: () => number;
  /** Até quando (a partir do início) o drain pega trabalho novo: 80% do `maxDuration`. */
  budgetMs?: number;
  /** Limite duro (a partir do início) em que as etapas são abortadas: `maxDuration` − folga. */
  hardLimitMs?: number;
  batchSize?: number;
  vtSec?: number;
  /** Tempo mínimo por etapa (padrão `STEP_MIN_MS`). */
  minStepMs?: (step: JobStep) => number;
  queues?: readonly QueueName[];
  /**
   * Chamado para cada mensagem que a varredura moveu para a quarentena sem passar pela etapa
   * (tentativas esgotadas): o `fetch` conta a falha final da fonte (D-F18). Erro aqui não derruba
   * o drain.
   */
  onExhausted?: (msg: PipelineMessage, error: string) => Promise<void>;
  /**
   * Pré-etapa do drain (spec 2026-09-28 §12.2, G7): `push_dispatch_due()` enfileira envios
   * aprovados, agendados vencidos, retomados e entregas adiadas. Erro é registrado e não
   * impede o drain.
   */
  beforeDrain?: () => Promise<void>;
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
  const hardDeadline =
    start + (deps.hardLimitMs ?? DRAIN_MAX_DURATION_SEC * 1000 - DRAIN_SAFETY_MS);
  const deadline = Math.min(
    hardDeadline,
    start + (deps.budgetMs ?? DRAIN_MAX_DURATION_SEC * 1000 * DRAIN_BUDGET_RATIO),
  );
  const batchSize = deps.batchSize ?? DRAIN_BATCH_SIZE;
  const vtSec = deps.vtSec ?? DRAIN_VISIBILITY_SEC;
  const queues = deps.queues ?? QUEUE_NAMES;
  const minStepMs = deps.minStepMs ?? ((step: JobStep) => STEP_MIN_MS[step] ?? DEFAULT_STEP_MIN_MS);
  const r: DrainResult = {
    processed: 0,
    succeeded: 0,
    retried: 0,
    quarantined: 0,
    released: 0,
    exhausted: 0,
    remaining: 0,
  };
  let log: PipelineEvent[] = [];
  // Grava os eventos em lotes durante o drain: uma queda no fim não apaga o registro do trabalho.
  const flush = async () => {
    if (log.length === 0) return;
    const out = log;
    log = [];
    await deps.events.record(out);
  };
  const push = async (e: PipelineEvent) => {
    log.push(e);
    if (log.length >= DRAIN_EVENTS_FLUSH) await flush();
  };

  try {
    if (deps.beforeDrain) {
      try {
        await deps.beforeDrain();
      } catch (ex) {
        await push({
          runId: null,
          step: "push_match",
          itemRef: null,
          level: "warn",
          message: `pré-etapa do drain falhou: ${ex instanceof Error ? ex.message : String(ex)}`,
        });
      }
    }
    for (const name of queues) {
      const moved = await queue.moveExhausted(name, MAX_ATTEMPTS);
      r.exhausted += moved.length;
      for (const { msg, error } of moved) {
        if (!msg || !deps.onExhausted) continue;
        try {
          await deps.onExhausted(msg, error);
        } catch (ex) {
          await push({
            runId: msg.runId,
            step: msg.step,
            itemRef: msg.itemRef,
            level: "warn",
            message: `falha ao contabilizar mensagem esgotada: ${ex instanceof Error ? ex.message : String(ex)}`,
          });
        }
      }
    }

    // Uma etapa pode enfileirar a próxima em outra fila (queueFor): repete a volta pelas filas
    // até nenhuma ter mensagem pronta ou o tempo acabar.
    let outOfTime = false;
    let hardStop = false;
    outer: while (now() < deadline && !outOfTime && !hardStop) {
      let progressed = false;
      for (const name of queues) {
        while (now() < deadline && !outOfTime && !hardStop) {
          const batch = await queue.readBatch(name, batchSize, vtSec);
          if (batch.length === 0) break;
          progressed = true;
          for (let i = 0; i < batch.length; i++) {
            const q = batch[i]!;
            if (now() >= deadline || hardStop) {
              for (const rest of batch.slice(i)) await queue.release(name, rest.msgId);
              r.released += batch.length - i;
              await flush();
              break outer;
            }
            // Etapa cara sem tempo até o limite duro: devolve sem contar tentativa e não lê mais
            // lotes (as etapas baratas deste lote ainda rodam).
            const remainingMs = hardDeadline - now();
            if (remainingMs < minStepMs(q.msg.step)) {
              await queue.release(name, q.msgId);
              r.released++;
              outOfTime = true;
              continue;
            }
            r.processed++;
            const signal = AbortSignal.timeout(Math.max(0, remainingMs));
            let notes: Record<string, unknown> = {};
            const note = (d: Record<string, unknown>) => void (notes = { ...notes, ...d });
            const res = await runStep(q.msg, { signal, note });
            let e: StepError;
            if (res.ok) {
              try {
                for (const next of res.value) await queue.enqueue(queueFor(next.step), next);
                await queue.ack(name, q.msgId);
                r.succeeded++;
                await push(
                  event(q, "info", "ok", {
                    next: res.value.length,
                    // Em `note`, para nunca sobrescrever `attempt`, `runRef` ou `kind` do evento.
                    ...(Object.keys(notes).length > 0 ? { note: notes } : {}),
                  }),
                );
                continue;
              } catch (ex) {
                // Etapa feita, próxima não enfileirada: a mensagem volta como falha transitória
                // (as etapas são idempotentes e devolvem a próxima de novo), sem abortar o lote.
                e = stepError.transient(
                  `falha ao enfileirar a próxima etapa: ${ex instanceof Error ? ex.message : String(ex)}`,
                );
              }
            } else e = res.error;
            // Falha transitória causada pelo prazo do drain não é culpa da mensagem.
            if (e.retryable && signal.aborted) {
              await queue.release(name, q.msgId);
              r.released++;
              hardStop = true;
              await push(event(q, "info", "prazo do drain: devolvida à fila", { kind: e.kind }));
              continue;
            }
            const policy = retryPolicy(q.readCt, { retryable: e.retryable });
            const decision =
              policy.action === "retry" && e.retryAfterSec !== undefined
                ? { ...policy, delaySec: Math.max(policy.delaySec, Math.ceil(e.retryAfterSec)) }
                : policy;
            const details = { kind: e.kind, ...(e.details ?? {}) };
            if (decision.action === "retry") {
              await queue.fail(name, q.msgId, `${e.kind}: ${e.message}`, decision.delaySec);
              r.retried++;
              await push(
                event(q, "warn", e.message, { ...details, retryInSec: decision.delaySec }),
              );
            } else {
              await queue.quarantine(name, q, `${e.kind}: ${e.message}`);
              r.quarantined++;
              await push(
                event(q, e.kind === "injection" ? "security" : "error", e.message, details),
              );
            }
          }
          await flush();
          // Uma leva por fila a cada volta (alternância): uma fila cheia não pode deixar as outras
          // (mídia, notificações) sem vez. Antes esvaziava a primeira fila inteira, e as imagens
          // nunca eram lidas enquanto houvesse mensagens na pipeline.
          break;
        }
      }
      if (!progressed) break;
    }
  } finally {
    await flush();
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
