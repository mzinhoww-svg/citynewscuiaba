import { isCronAuthorized, unauthorized } from "@/lib/security/cron-auth";
import type { Queue, RunStore } from "./ports";
import { fastLaneSources } from "./tick";
import { QUEUE_NAMES, type QueueName } from "./types";

/** Tick atrasado: último início há mais de 45 min (ADR-003, architecture §10). */
export const LATE_AFTER_MIN = 45;

/** Via rápida atrasada: último run `fast` há mais de 15 min (spec §7.8). */
export const FAST_LATE_AFTER_MIN = 15;

export interface IngestStatus {
  /** Último run `cron`: runs `fast` e `manual` não contam para o ciclo normal. */
  lastStartedAt: string | null;
  ageMinutes: number | null;
  late: boolean;
  /** Via rápida: `late` só vale com fonte rápida ativa (`sources > 0`). */
  fast: { lastStartedAt: string | null; ageMinutes: number | null; late: boolean; sources: number };
  /** Mensagens na fila (prontas, em processamento ou aguardando nova tentativa). */
  pending: Record<QueueName, number> & { total: number };
}

export interface StatusDeps {
  runs: Pick<
    RunStore,
    "lastStartedAt" | "lastFastStartedAt" | "activeSources" | "defaultFrequency"
  >;
  queue: Queue;
  now: () => Date;
}

/**
 * Estado do ciclo para o watchdog do GitHub: dispara o tick se `late` e o drain se houver fila
 * (sem pg_net, nada mais chama o drain).
 */
export async function ingestStatus(deps: StatusDeps): Promise<IngestStatus> {
  const minutesSince = (iso: string | null): number | null => {
    const t = iso ? Date.parse(iso) : Number.NaN;
    return Number.isFinite(t) ? Math.floor((deps.now().getTime() - t) / 60_000) : null;
  };
  const [last, lastFast, sources, defaultMinutes] = await Promise.all([
    deps.runs.lastStartedAt(),
    deps.runs.lastFastStartedAt(),
    deps.runs.activeSources(),
    deps.runs.defaultFrequency(),
  ]);
  const ageMinutes = minutesSince(last);
  const fastAge = minutesSince(lastFast);
  const fastSources = fastLaneSources(sources, defaultMinutes).length;
  const counts = await Promise.all(QUEUE_NAMES.map((q) => deps.queue.pending(q)));
  const pending = Object.fromEntries(QUEUE_NAMES.map((q, i) => [q, counts[i] ?? 0])) as Record<
    QueueName,
    number
  >;
  return {
    lastStartedAt: last,
    ageMinutes,
    late: ageMinutes === null || ageMinutes > LATE_AFTER_MIN,
    fast: {
      lastStartedAt: lastFast,
      ageMinutes: fastAge,
      late: fastSources > 0 && (fastAge === null || fastAge > FAST_LATE_AFTER_MIN),
      sources: fastSources,
    },
    pending: { ...pending, total: counts.reduce((s, n) => s + n, 0) },
  };
}

export async function handleStatus(
  req: Request,
  deps: StatusDeps & { secret: string | undefined },
): Promise<Response> {
  if (!isCronAuthorized(req.headers.get("authorization"), deps.secret)) return unauthorized();
  return Response.json(await ingestStatus(deps));
}
