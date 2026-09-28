import { err, ok, type Result } from "@/lib/result";
import type { Queue } from "./ports";
import { COLLECTION_STEPS } from "./types";
import { WINDOW_MINUTES } from "./window";

/**
 * "Executar agora" (O01): um ciclo fora da janela de 30 min, com `window_start` próprio (o
 * instante do pedido), marcado como manual. Enfileira a coleta de todas as fontes ativas, sem
 * esperar a frequência de cada uma, ou de uma fonte só. Como o tick, não começa enquanto o
 * ciclo mais recente ainda tiver etapas de Coleta na fila (spec §6.2).
 */

export interface RunNowRepo {
  /** Run mais recente (por início), se houver. */
  latestRunId(): Promise<string | null>;
  createManualRun(windowStart: Date, stats: Record<string, unknown>): Promise<string>;
  activeSources(): Promise<{ id: string; slug: string }[]>;
  source(id: string): Promise<{ id: string; slug: string; status: string } | null>;
}

export interface RunNowDeps {
  queue: Queue;
  repo: RunNowRepo;
  now: () => Date;
}

export type RunNowError = "collecting" | "not_found" | "source_inactive";

/** O instante do pedido; no limite exato de uma janela, 1 ms depois (não disputa o run do cron). */
export function manualWindowStart(at: Date): Date {
  const size = WINDOW_MINUTES * 60_000;
  return at.getTime() % size === 0 ? new Date(at.getTime() + 1) : new Date(at.getTime());
}

export async function runNow(
  deps: RunNowDeps,
  input: { requestedBy: string; sourceId?: string },
): Promise<Result<{ runId: string; windowStart: string; enqueued: number }, RunNowError>> {
  let sources: { id: string; slug: string }[];
  if (input.sourceId) {
    const s = await deps.repo.source(input.sourceId);
    if (!s) return err("not_found");
    if (s.status !== "active") return err("source_inactive");
    sources = [s];
  } else sources = await deps.repo.activeSources();

  const latest = await deps.repo.latestRunId();
  if (latest) {
    const collecting = await deps.queue.pending("pipeline", {
      runId: latest,
      steps: COLLECTION_STEPS,
    });
    if (collecting > 0) return err("collecting");
  }

  const windowStart = manualWindowStart(deps.now());
  const runId = await deps.repo.createManualRun(windowStart, {
    manual: true,
    requested_by: input.requestedBy,
    ...(input.sourceId ? { source_id: input.sourceId } : {}),
    fetch_enqueued: sources.length,
  });
  let enqueued = 0;
  for (const s of sources) {
    const added = await deps.queue.enqueue("pipeline", {
      runId,
      step: "fetch",
      itemRef: `source:${s.slug}`,
      attempt: 1,
    });
    if (added) enqueued++;
  }
  return ok({ runId, windowStart: windowStart.toISOString(), enqueued });
}
