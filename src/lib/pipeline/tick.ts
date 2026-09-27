import { isCronAuthorized, unauthorized } from "@/lib/security/cron-auth";
import type { DueSource, Queue, RunStore } from "./ports";
import { COLLECTION_STEPS } from "./types";
import { windowStart } from "./window";

/** Tolerância para atraso do cron: uma fonte de 30 min coletada há 28 min já é devida. */
const DUE_TOLERANCE_MS = 2 * 60_000;

/** Fontes cuja frequência (mínimo 30 min) já venceu desde a última coleta. */
export function dueSources(sources: readonly DueSource[], now: Date): DueSource[] {
  return sources.filter((s) => {
    if (!s.lastFetchedAt) return true;
    const last = Date.parse(s.lastFetchedAt);
    if (Number.isNaN(last)) return true;
    const every = Math.max(30, s.frequencyMinutes) * 60_000;
    return now.getTime() - last >= every - DUE_TOLERANCE_MS;
  });
}

export interface TickDeps {
  queue: Queue;
  runs: RunStore;
  now: () => Date;
}

export type TickResult =
  | { status: "started" | "existing"; runId: string; windowStart: string; enqueued: number }
  | { status: "skipped"; reason: "previous_collecting"; runId: string; windowStart: string };

/**
 * Etapa 1 (cron). Um run por janela de 30 min (`unique(window_start)`): pg_cron e watchdog
 * podem disparar juntos. O próximo ciclo não começa enquanto o anterior tiver etapas de Coleta
 * na fila (spec §6.2). Os fetch são enfileirados com chave `(fetch, fonte)`: repetir é inofensivo.
 */
export async function runTick({ queue, runs, now }: TickDeps): Promise<TickResult> {
  const at = now();
  const window = windowStart(at);
  const windowIso = window.toISOString();

  const previous = await runs.previousOpenRun(window);
  if (previous) {
    const collecting = await queue.pending("pipeline", {
      runId: previous,
      steps: COLLECTION_STEPS,
    });
    if (collecting > 0)
      return {
        status: "skipped",
        reason: "previous_collecting",
        runId: previous,
        windowStart: windowIso,
      };
  }

  const run = await runs.startRun(window);
  let enqueued = 0;
  if (!run.fetchEnqueued) {
    for (const source of dueSources(await runs.activeSources(), at)) {
      const added = await queue.enqueue("pipeline", {
        runId: run.runId,
        step: "fetch",
        itemRef: `source:${source.slug}`,
        attempt: 1,
      });
      if (added) enqueued++;
    }
    await runs.markFetchEnqueued(run.runId, enqueued);
  }
  return {
    status: run.created ? "started" : "existing",
    runId: run.runId,
    windowStart: windowIso,
    enqueued,
  };
}

export async function handleTick(
  req: Request,
  deps: TickDeps & { secret: string | undefined },
): Promise<Response> {
  if (!isCronAuthorized(req.headers.get("authorization"), deps.secret)) return unauthorized();
  return Response.json(await runTick(deps));
}
