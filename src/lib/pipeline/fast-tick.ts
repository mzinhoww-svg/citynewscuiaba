import { isCronAuthorized, unauthorized } from "@/lib/security/cron-auth";
import type { Queue, RunStore } from "./ports";
import { dueSources, laneSources } from "./tick";
import { fastWindowStart } from "./window";

export type FastSkipReason = "rate_limited" | "previous_pending" | "fast_lane_full";

export interface FastTickDeps {
  queue: Queue;
  runs: RunStore;
  /**
   * `peek_rate_limit`: `true` se o bucket (`crawler:<slug>`) ainda tem cota na hora. Só consulta,
   * nunca consome: a cota é gasta pelo próprio `fetch`.
   */
  peekRateLimit: (bucket: string, limitPerHour: number) => Promise<boolean>;
  now: () => Date;
}

export type FastTickResult =
  | { status: "idle" }
  | {
      status: "started" | "existing";
      runId: string;
      windowStart: string;
      enqueued: number;
      skipped: { slug: string; reason: FastSkipReason }[];
    };

/**
 * Tick rápido (spec §7.8, D-F15, D-F29): a cada 10 min, só o `fetch` das fontes da via rápida
 * (frequência efetiva < 30 min) vencidas. Sem fonte rápida `active`/`degraded`, `idle` sem run.
 * Um run `fast` por janela de 10 min (índice único parcial); se os fetch da janela já foram
 * enfileirados, não enfileira de novo. Ordem prioridade → score → slug (a de `activeSources`),
 * até `fast_lane_max` mensagens; pula com motivo (em `ingest_runs.stats.skipped`) a fonte com
 * `fetch` já na fila de qualquer run, a sem cota na hora e a que não coube.
 */
export async function runFastTick({
  queue,
  runs,
  peekRateLimit,
  now,
}: FastTickDeps): Promise<FastTickResult> {
  const at = now();
  const [sources, defaultMinutes] = await Promise.all([
    runs.activeSources(),
    runs.defaultFrequency(),
  ]);
  if (laneSources(sources, defaultMinutes, "fast").length === 0) return { status: "idle" };

  const window = fastWindowStart(at);
  const run = await runs.startFastRun(window);
  const base = {
    status: run.created ? ("started" as const) : ("existing" as const),
    runId: run.runId,
    windowStart: window.toISOString(),
  };
  if (run.fetchEnqueued) return { ...base, enqueued: 0, skipped: [] };

  const max = await runs.fastLaneMax();
  const skipped: { slug: string; reason: FastSkipReason }[] = [];
  let enqueued = 0;
  for (const source of dueSources(sources, at, defaultMinutes, "fast")) {
    const itemRef = `source:${source.slug}`;
    if ((await queue.pending("pipeline", { itemRef, steps: ["fetch"] })) > 0) {
      skipped.push({ slug: source.slug, reason: "previous_pending" });
      continue;
    }
    if (enqueued >= max) {
      skipped.push({ slug: source.slug, reason: "fast_lane_full" });
      continue;
    }
    if (!(await peekRateLimit(`crawler:${source.slug}`, source.rateLimitPerHour))) {
      skipped.push({ slug: source.slug, reason: "rate_limited" });
      continue;
    }
    const added = await queue.enqueue("pipeline", {
      runId: run.runId,
      step: "fetch",
      itemRef,
      attempt: 1,
    });
    // Corrida com outro tick entre a checagem e o enfileiramento: a chave já existia.
    if (added) enqueued++;
    else skipped.push({ slug: source.slug, reason: "previous_pending" });
  }
  await runs.markFetchEnqueued(run.runId, enqueued, { skipped });
  return { ...base, enqueued, skipped };
}

export async function handleFastTick(
  req: Request,
  deps: FastTickDeps & { secret: string | undefined },
): Promise<Response> {
  if (!isCronAuthorized(req.headers.get("authorization"), deps.secret)) return unauthorized();
  return Response.json(await runFastTick(deps));
}
