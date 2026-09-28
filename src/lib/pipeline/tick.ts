import { isCronAuthorized, unauthorized } from "@/lib/security/cron-auth";
import { effectiveFrequency, isDue, laneOf } from "@/lib/sources/frequency";
import type { DueSource, Queue, RunStore } from "./ports";
import { COLLECTION_STEPS } from "./types";
import { windowStart } from "./window";

export type Lane = "normal" | "fast";

/** Frequência efetiva da fonte (escolhida ou padrão, elevada por `Crawl-delay` e termos, §7.8). */
export function effectiveMinutes(source: DueSource, defaultMinutes: number): number {
  return effectiveFrequency(source.frequencyMinutes, defaultMinutes, {
    crawlDelaySec: source.crawlDelaySec,
    termsMinIntervalMinutes: source.termsMinIntervalMinutes,
  }).minutes;
}

/** Fontes da via pedida (efetiva < 30 min = rápida), na ordem recebida. */
export function laneSources(
  sources: readonly DueSource[],
  defaultMinutes: number,
  lane: Lane,
): DueSource[] {
  return sources.filter((s) => laneOf(effectiveMinutes(s, defaultMinutes)) === lane);
}

/**
 * Fontes da via pedida cuja frequência efetiva venceu (D-F17): ciclo normal compara janelas de
 * 30 min, via rápida conta a grade de F minutos em cima das janelas de 10 min (`isDue`).
 * Data de última coleta ilegível conta como nunca coletada.
 */
export function dueSources(
  sources: readonly DueSource[],
  now: Date,
  defaultMinutes: number,
  lane: Lane,
): DueSource[] {
  return sources.filter((s) => {
    const frequencyMinutes = effectiveMinutes(s, defaultMinutes);
    if (laneOf(frequencyMinutes) !== lane) return false;
    const last =
      s.lastFetchedAt !== null && Number.isFinite(Date.parse(s.lastFetchedAt))
        ? s.lastFetchedAt
        : null;
    return isDue({ lastFetchedAt: last, frequencyMinutes }, now);
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
 * Etapa 1 (cron). Um run `cron` por janela de 30 min (índice único parcial): pg_cron e watchdog
 * podem disparar juntos. O próximo ciclo não começa enquanto o `cron` anterior tiver etapas de
 * Coleta na fila (spec §6.2); runs `fast` e `manual` não contam. Só fontes do ciclo normal
 * (frequência efetiva ≥ 30 min): as da via rápida são do tick rápido (§7.8). Os fetch são
 * enfileirados com chave `(fetch, fonte)`: repetir é inofensivo.
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
    for (const source of dueSources(sources, at, defaultMinutes, "normal")) {
      const added = await queue.enqueue("pipeline", {
        runId: run.runId,
        step: "fetch",
        itemRef: `source:${source.slug}`,
        attempt: 1,
      });
      if (added) enqueued++;
    }
    // Atômico e só se ainda não marcado: um tick concorrente que perdeu a corrida (enfileirou 0 por
    // causa do dedupe da fila) não sobrescreve as estatísticas do vencedor.
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
