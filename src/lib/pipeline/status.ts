import { isCronAuthorized, unauthorized } from "@/lib/security/cron-auth";
import type { Queue } from "./ports";
import { QUEUE_NAMES, type QueueName } from "./types";

/** Tick atrasado: último início há mais de 45 min (ADR-003, architecture §10). */
export const LATE_AFTER_MIN = 45;

export interface IngestStatus {
  lastStartedAt: string | null;
  ageMinutes: number | null;
  late: boolean;
  /** Mensagens na fila (prontas, em processamento ou aguardando nova tentativa). */
  pending: Record<QueueName, number> & { total: number };
}

export interface StatusDeps {
  runs: { lastStartedAt(): Promise<string | null> };
  queue: Queue;
  now: () => Date;
}

/**
 * Estado do ciclo para o watchdog do GitHub: dispara o tick se `late` e o drain se houver fila
 * (sem pg_net, nada mais chama o drain).
 */
export async function ingestStatus(deps: StatusDeps): Promise<IngestStatus> {
  const last = await deps.runs.lastStartedAt();
  const t = last ? Date.parse(last) : Number.NaN;
  const ageMinutes = Number.isFinite(t) ? Math.floor((deps.now().getTime() - t) / 60_000) : null;
  const counts = await Promise.all(QUEUE_NAMES.map((q) => deps.queue.pending(q)));
  const pending = Object.fromEntries(QUEUE_NAMES.map((q, i) => [q, counts[i] ?? 0])) as Record<
    QueueName,
    number
  >;
  return {
    lastStartedAt: last,
    ageMinutes,
    late: ageMinutes === null || ageMinutes > LATE_AFTER_MIN,
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
