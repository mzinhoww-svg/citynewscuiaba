import { isCronAuthorized, unauthorized } from "@/lib/security/cron-auth";
import type { Queue, RunStore } from "./ports";
import { laneSources } from "./tick";
import { QUEUE_NAMES, type QueueName } from "./types";

/** Tick atrasado: último início de run `cron` há mais de 45 min (ADR-003, architecture §10). */
export const LATE_AFTER_MIN = 45;
/** Tick rápido atrasado: último run `fast` há mais de 15 min, com fonte rápida ativa (§7.8). */
export const FAST_LATE_AFTER_MIN = 15;

export interface FastStatus {
  lastStartedAt: string | null;
  ageMinutes: number | null;
  late: boolean;
  /** Fontes `active`/`degraded` com frequência efetiva < 30 min. */
  sources: number;
}

export interface IngestStatus {
  /** Só runs `cron`: manuais e rápidos nunca escondem um tick normal atrasado (D-F21). */
  lastStartedAt: string | null;
  ageMinutes: number | null;
  late: boolean;
  /** Mensagens na fila (prontas, em processamento ou aguardando nova tentativa). */
  pending: Record<QueueName, number> & { total: number };
  fast: FastStatus;
}

export interface StatusDeps {
  runs: Pick<
    RunStore,
    "lastStartedAt" | "lastFastStartedAt" | "activeSources" | "defaultFrequency"
  >;
  queue: Queue;
  now: () => Date;
}

const ageOf = (iso: string | null, now: Date): number | null => {
  const t = iso ? Date.parse(iso) : Number.NaN;
  return Number.isFinite(t) ? Math.floor((now.getTime() - t) / 60_000) : null;
};

/**
 * Estado do ciclo para o watchdog do GitHub: dispara o tick se `late`, o tick rápido se
 * `fast.late` (só com fonte rápida ativa) e o drain se houver fila (sem pg_net, nada mais chama).
 */
export async function ingestStatus(deps: StatusDeps): Promise<IngestStatus> {
  const at = deps.now();
  const [last, lastFast, sources, defaultMinutes, counts] = await Promise.all([
    deps.runs.lastStartedAt(),
    deps.runs.lastFastStartedAt(),
    deps.runs.activeSources(),
    deps.runs.defaultFrequency(),
    Promise.all(QUEUE_NAMES.map((q) => deps.queue.pending(q))),
  ]);
  const ageMinutes = ageOf(last, at);
  const pending = Object.fromEntries(QUEUE_NAMES.map((q, i) => [q, counts[i] ?? 0])) as Record<
    QueueName,
    number
  >;
  const fastSources = laneSources(sources, defaultMinutes, "fast").length;
  const fastAge = ageOf(lastFast, at);
  return {
    lastStartedAt: last,
    ageMinutes,
    late: ageMinutes === null || ageMinutes > LATE_AFTER_MIN,
    pending: { ...pending, total: counts.reduce((s, n) => s + n, 0) },
    fast: {
      lastStartedAt: lastFast,
      ageMinutes: fastAge,
      late: fastSources > 0 && (fastAge === null || fastAge > FAST_LATE_AFTER_MIN),
      sources: fastSources,
    },
  };
}

export async function handleStatus(
  req: Request,
  deps: StatusDeps & { secret: string | undefined },
): Promise<Response> {
  if (!isCronAuthorized(req.headers.get("authorization"), deps.secret)) return unauthorized();
  return Response.json(await ingestStatus(deps));
}
