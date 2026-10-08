import { checkRateLimit, clientIp, ipKey, rateLimitSalt } from "@/lib/security/rate-limit";

/** Corpo máximo aceito (a mensagem e o início da pilha cabem com folga). */
export const MAX_CLIENT_ERROR_BYTES = 4 * 1024;
/** Por IP (hash com sal diário): 10 registros a cada 10 minutos. */
export const CLIENT_ERROR_LIMIT = 10;
export const CLIENT_ERROR_WINDOW_SECONDS = 600;

export interface ClientErrorReport {
  message: string;
  stack: string;
  path: string;
  digest: string;
}

const clip = (v: unknown, max: number): string => (typeof v === "string" ? v.slice(0, max) : "");

/** Só campos conhecidos, com tamanho limitado; `null` se não for um JSON de objeto. */
export function parseClientError(text: string): ClientErrorReport | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  return {
    message: clip(r.message, 300),
    stack: clip(r.stack, 1500),
    path: clip(r.path, 120),
    digest: clip(r.digest, 40),
  };
}

const HEADERS = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };
const status = (code: number) => new Response(null, { status: code, headers: HEADERS });

/**
 * POST /api/client-error: a tela de erro avisa o que quebrou no navegador do leitor. Só vai para
 * o log do servidor (nada é gravado no banco); o User-Agent entra no log para achar o aparelho.
 * 204 registrado · 400 inválido · 413 grande demais · 429 limite.
 */
export async function handleClientError(req: Request, now: Date = new Date()): Promise<Response> {
  if (Number(req.headers.get("content-length") ?? 0) > MAX_CLIENT_ERROR_BYTES) return status(413);
  let text: string;
  try {
    text = await req.text();
  } catch {
    return status(400);
  }
  if (new TextEncoder().encode(text).length > MAX_CLIENT_ERROR_BYTES) return status(413);
  const report = parseClientError(text);
  if (!report) return status(400);
  const key = ipKey(clientIp(req.headers), now, rateLimitSalt() ?? "sem-sal");
  if (
    !(await checkRateLimit(`client-error:${key}`, CLIENT_ERROR_LIMIT, CLIENT_ERROR_WINDOW_SECONDS))
  )
    return status(429);
  const ua = (req.headers.get("user-agent") ?? "").slice(0, 200);
  console.error(`client-error: ${report.message}`, { ...report, ua });
  return status(204);
}
