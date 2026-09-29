import { err, ok, type Result } from "@/lib/result";
import type { IngestRepo, Queue, RunStore } from "./ports";

/** Limites de "Coletar agora" (spec §7.4, §10): 1 a cada 5 min por fonte, 20 por hora por pessoa. */
export const COLLECT_NOW_SOURCE_LIMIT = { bucket: "collect_now_source", limit: 1, windowSec: 300 };
export const COLLECT_NOW_ACTOR_LIMIT = { bucket: "collect_now_actor", limit: 20, windowSec: 3600 };

export interface CollectNowDeps {
  runs: Pick<RunStore, "startManualRun" | "markFetchEnqueued">;
  queue: Queue;
  repo: Pick<IngestRepo, "sourceById">;
  /** `hit_rate_limit` (compartilhado entre instâncias, A-028): conta e diz se ainda cabe. */
  hitRateLimit: (bucket: string, key: string, limit: number, windowSec: number) => Promise<boolean>;
  /** `peek_rate_limit`: diz se ainda cabe, sem consumir. */
  peekRateLimit: (
    bucket: string,
    key: string,
    limit: number,
    windowSec: number,
  ) => Promise<boolean>;
  /** Pessoa que pediu (id do Estúdio): chave do limite por pessoa. */
  actor: string;
}

export type CollectNowError = "not_active" | "rate_limited" | "not_found";

/**
 * "Coletar agora" (D-F21): run `manual` próprio só com o `fetch` da fonte, com chave de fila
 * própria (`fetch:source:<slug>:manual:<runId>`), então convive com um `fetch` pendente do ciclo
 * normal ou da via rápida e não altera o run da janela. Runs manuais não passam pela trava de
 * coleta dupla (D-F29) e não contam para o watchdog; `robots.txt` e `rate_limit_per_hour`
 * continuam valendo no `fetch`. A auditoria (`source.collect_now`) fica com a Server Action.
 */
export async function collectNow(
  sourceId: string,
  deps: CollectNowDeps,
): Promise<Result<{ runId: string }, CollectNowError>> {
  const source = await deps.repo.sourceById(sourceId);
  if (!source) return err("not_found");
  if (source.status !== "active" && source.status !== "degraded") return err("not_active");

  // Fonte primeiro, só consultando: fonte no limite de 5 min não gasta a cota de 20/h da pessoa
  // (fix round 1, #8). Depois consome a da pessoa e, por fim, a da fonte. Numa corrida entre duas
  // pessoas na mesma fonte, a perdedora ainda gasta um pedido da própria cota (aceitável).
  const s = COLLECT_NOW_SOURCE_LIMIT;
  const a = COLLECT_NOW_ACTOR_LIMIT;
  if (!(await deps.peekRateLimit(s.bucket, source.id, s.limit, s.windowSec)))
    return err("rate_limited");
  if (!(await deps.hitRateLimit(a.bucket, deps.actor, a.limit, a.windowSec)))
    return err("rate_limited");
  if (!(await deps.hitRateLimit(s.bucket, source.id, s.limit, s.windowSec)))
    return err("rate_limited");

  const { runId } = await deps.runs.startManualRun(source.id);
  const itemRef = `source:${source.slug}`;
  await deps.queue.enqueue(
    "pipeline",
    { runId, step: "fetch", itemRef, attempt: 1 },
    { dedupeKey: `fetch:${itemRef}:manual:${runId}` },
  );
  await deps.runs.markFetchEnqueued(runId, 1, { source: source.id });
  return ok({ runId });
}
