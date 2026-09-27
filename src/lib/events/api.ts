import "server-only";
import { hitRateLimit, saveReaderEvent, type WriteError } from "@/lib/db/writes";
import type { Result } from "@/lib/result";
import { checkRateLimit, clientIp, ipKey, rateLimitSalt } from "@/lib/security/rate-limit";
import { parseEvent, type EventEnvelope } from "./schema";

/** Tamanho máximo do corpo (um evento). */
export const MAX_EVENT_BYTES = 8 * 1024;
/** Limite de uso por IP (hash com sal diário): 120 eventos a cada 10 minutos. */
export const EVENTS_LIMIT = 120;
export const EVENTS_WINDOW_SECONDS = 600;
/** Relógio do cliente aceito até 48 h de diferença (beacons atrasados, relógio errado). */
const MAX_CLOCK_SKEW_MS = 48 * 3_600_000;

export interface EventsDeps {
  insert: (e: EventEnvelope) => Promise<Result<void, WriteError>>;
  hitLimit: (keyHash: string) => Promise<Result<boolean, WriteError>>;
  /** `null` sem sal em produção (A-051): recusa com 503, falha fechado. */
  salt: string | null;
  now: () => Date;
}

export function defaultEventsDeps(): EventsDeps {
  return {
    insert: saveReaderEvent,
    hitLimit: (key) => hitRateLimit("events", key, EVENTS_LIMIT, EVENTS_WINDOW_SECONDS),
    salt: rateLimitSalt(),
    now: () => new Date(),
  };
}

const HEADERS = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };

function status(code: number, error?: string): Response {
  return error
    ? Response.json({ error }, { status: code, headers: HEADERS })
    : new Response(null, { status: code, headers: HEADERS });
}

/**
 * POST /api/events (tracking-plan §1): valida com zod, aplica o limite de uso e grava em
 * `events` com `received_at` do servidor. 204 gravado · 400 inválido · 413 grande demais ·
 * 429 limite · 503 sem banco (o navegador ignora; a página nunca depende disto).
 */
export async function handleEvents(req: Request, deps: EventsDeps): Promise<Response> {
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_EVENT_BYTES) return status(413, "grande demais");
  let text: string;
  try {
    text = await req.text();
  } catch {
    return status(400, "corpo ilegível");
  }
  if (new TextEncoder().encode(text).length > MAX_EVENT_BYTES) return status(413, "grande demais");

  const parsed = parseEvent(text);
  if (!parsed.ok) return status(400, parsed.error);
  const event = parsed.value;
  const now = deps.now();
  if (Math.abs(Date.parse(event.at) - now.getTime()) > MAX_CLOCK_SKEW_MS)
    return status(400, "data fora do intervalo");

  if (!deps.salt) return status(503, "indisponível");
  const key = ipKey(clientIp(req.headers), now, deps.salt);
  if (!(await checkRateLimit(`events:${key}`, EVENTS_LIMIT, EVENTS_WINDOW_SECONDS)))
    return status(429, "limite");
  const limit = await deps.hitLimit(key);
  if (limit.ok && !limit.value) return status(429, "limite");

  const saved = await deps.insert(event);
  if (!saved.ok) return status(503, saved.error.kind);
  return status(204);
}
