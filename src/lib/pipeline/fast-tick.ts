import { isCronAuthorized, unauthorized } from "@/lib/security/cron-auth";
import type { Queue, RunStore } from "./ports";
import { dueSources, fastLaneSources } from "./tick";
import { fastWindowStart } from "./window";

export type FastSkipReason = "rate_limited" | "previous_pending" | "fast_lane_full";

export type FastTickResult =
  | { status: "idle" }
  | {
      status: "started" | "existing";
      runId: string;
      windowStart: string;
      enqueued: number;
      skipped: { slug: string; reason: FastSkipReason }[];
    };

export interface FastTickDeps {
  queue: Queue;
  runs: RunStore;
  /** Só consulta a cota da fonte (`crawler:<slug>`); `true` = ainda cabe uma requisição. */
  peekRateLimit: (bucket: string, limitPerHour: number) => Promise<boolean>;
  now: () => Date;
}

/**
 * Tick da via rápida (spec §7.8), a cada 10 min: um run `fast` por janela de 10 min que enfileira
 * só o `fetch` das fontes com frequência efetiva < 30 min já vencidas, até `fast_lane_max`. O
 * resto do pipeline segue na mesma fila e no mesmo drain. Sem fonte rápida ativa: `idle`, sem run.
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
  if (fastLaneSources(sources, defaultMinutes).length === 0) return { status: "idle" };

  const window = fastWindowStart(at);
  const run = await runs.startFastRun(window);
  const base = { runId: run.runId, windowStart: window.toISOString() };
  if (run.fetchEnqueued) return { status: "existing", ...base, enqueued: 0, skipped: [] };

  const max = await runs.fastLaneMax();
  const skipped: { slug: string; reason: FastSkipReason }[] = [];
  let enqueued = 0;
  for (const source of dueSources(sources, at, defaultMinutes, "fast")) {
    const ref = `source:${source.slug}`;
    // Uma coleta da fonte já está na fila (qualquer run): não abre outra.
    if ((await queue.pending("pipeline", { itemRef: ref, steps: ["fetch"] })) > 0) {
      skipped.push({ slug: source.slug, reason: "previous_pending" });
      continue;
    }
    if (!(await peekRateLimit(`crawler:${source.slug}`, source.rateLimitPerHour))) {
      skipped.push({ slug: source.slug, reason: "rate_limited" });
      continue;
    }
    if (enqueued >= max) {
      skipped.push({ slug: source.slug, reason: "fast_lane_full" });
      continue;
    }
    const added = await queue.enqueue("pipeline", {
      runId: run.runId,
      step: "fetch",
      itemRef: ref,
      attempt: 1,
    });
    if (added) enqueued++;
    else skipped.push({ slug: source.slug, reason: "previous_pending" });
  }
  await runs.markFetchEnqueued(run.runId, enqueued, { skipped });
  return { status: run.created ? "started" : "existing", ...base, enqueued, skipped };
}

export async function handleFastTick(
  req: Request,
  deps: FastTickDeps & { secret: string | undefined },
): Promise<Response> {
  if (!isCronAuthorized(req.headers.get("authorization"), deps.secret)) return unauthorized();
  return Response.json(await runFastTick(deps));
}
