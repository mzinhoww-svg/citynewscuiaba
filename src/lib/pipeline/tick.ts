import { isCronAuthorized, unauthorized } from "@/lib/security/cron-auth";
import { effectiveFrequency, isDue, laneOf } from "@/lib/sources/frequency";
import type { DueSource, Queue, RunStore } from "./ports";
import { COLLECTION_STEPS } from "./types";
import { windowStart } from "./window";

/**
 * Fontes devidas na via pedida. Usa a frequência efetiva (escolhida ou padrão, elevada por
 * `Crawl-delay` e pelo intervalo dos termos) e o vencimento por janela (D-F17): uma fonte de
 * 30 min coletada às 14:07 vence no tick de 14:30. Ordem: prioridade, score editorial (maior
 * primeiro), slug.
 */
export function dueSources(
  sources: readonly DueSource[],
  now: Date,
  defaultMinutes: number,
  lane: "normal" | "fast",
): DueSource[] {
  return sources
    .filter((s) => {
      const { minutes } = effectiveFrequency(s.frequencyMinutes, defaultMinutes, {
        crawlDelaySec: s.crawlDelaySec,
        termsMinIntervalMinutes: s.termsMinIntervalMinutes,
      });
      return (
        laneOf(minutes) === lane &&
        isDue({ lastFetchedAt: s.lastFetchedAt, frequencyMinutes: minutes }, now)
      );
    })
    .sort(
      (a, b) =>
        a.priority - b.priority ||
        b.editorialScore - a.editorialScore ||
        (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0),
    );
}

/** Fontes que estão na via rápida pela frequência efetiva. */
export function fastLaneSources(
  sources: readonly DueSource[],
  defaultMinutes: number,
): DueSource[] {
  return sources.filter(
    (s) =>
      laneOf(
        effectiveFrequency(s.frequencyMinutes, defaultMinutes, {
          crawlDelaySec: s.crawlDelaySec,
          termsMinIntervalMinutes: s.termsMinIntervalMinutes,
        }).minutes,
      ) === "fast",
  );
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
 * Etapa 1 (cron). Um run `cron` por janela de 30 min (índice único parcial em `window_start`): pg_cron e watchdog
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
    const [sources, defaultMinutes] = await Promise.all([
      runs.activeSources(),
      runs.defaultFrequency(),
    ]);
    // Fontes da via rápida nunca entram no tick de 30 min (spec §7.8).
    for (const source of dueSources(sources, at, defaultMinutes, "normal")) {
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
