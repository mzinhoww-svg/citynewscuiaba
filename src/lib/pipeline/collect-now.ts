import { createHash } from "node:crypto";
import { err, ok, type Result } from "@/lib/result";
import type { IngestRepo, Queue, RunStore } from "./ports";

/** "Coletar agora": 1 por fonte a cada 5 min e 20 por hora por pessoa (Global Constraints). */
export const COLLECT_NOW_SOURCE_GAP_MS = 5 * 60_000;
export const COLLECT_NOW_PER_PERSON_PER_HOUR = 20;

export interface CollectNowDeps {
  runs: Pick<RunStore, "startManualRun" | "lastManualRunAt">;
  queue: Queue;
  repo: Pick<IngestRepo, "sourceById" | "hitRateLimit">;
  now: () => Date;
  /** Quem pediu (id da pessoa); só o hash entra na chave da cota. */
  actor: string;
}

export type CollectNowError = "not_active" | "rate_limited" | "not_found";

/**
 * Coleta imediata de uma fonte `active` ou `degraded`: run `manual` com só o `fetch` da fonte.
 * O `itemRef` leva o run (`source:<slug>:manual:<runId>`) para a mensagem não se fundir com a
 * coleta agendada da mesma fonte na fila; o run manual não passa pela trava de janela.
 */
export async function collectNow(
  sourceId: string,
  deps: CollectNowDeps,
): Promise<Result<{ runId: string }, CollectNowError>> {
  const source = await deps.repo.sourceById(sourceId);
  if (!source) return err("not_found");
  if (source.status !== "active" && source.status !== "degraded") return err("not_active");

  const last = await deps.runs.lastManualRunAt(source.id);
  if (last && deps.now().getTime() - Date.parse(last) < COLLECT_NOW_SOURCE_GAP_MS)
    return err("rate_limited");
  const person = createHash("sha256").update(deps.actor).digest("hex").slice(0, 32);
  if (!(await deps.repo.hitRateLimit(`collect_now:${person}`, COLLECT_NOW_PER_PERSON_PER_HOUR)))
    return err("rate_limited");

  const runId = await deps.runs.startManualRun(source.id);
  await deps.queue.enqueue("pipeline", {
    runId,
    step: "fetch",
    itemRef: `source:${source.slug}:manual:${runId}`,
    attempt: 1,
  });
  return ok({ runId });
}
