import { checkRateLimit, clientIp, ipKey, rateLimitSalt } from "@/lib/security/rate-limit";

/**
 * Corpo máximo aceito. O navegador já corta a mensagem e a pilha, mas pilhas longas de erro
 * minificado passavam de 4 KB e eram recusadas sem deixar rastro; aqui o corte final é feito
 * em `parseClientError`.
 */
export const MAX_CLIENT_ERROR_BYTES = 32 * 1024;
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

/** Recusa também deixa rastro no log: um aviso que some em silêncio não ajuda a achar o erro. */
function refused(code: number, bytes: number): Response {
  console.warn(`client-error: recusado ${code}`, { bytes });
  return status(code);
}

/**
 * POST /api/client-error: a tela de erro avisa o que quebrou no navegador do leitor. Só vai para
 * o log do servidor (nada é gravado no banco); o User-Agent entra no log para achar o aparelho.
 * 204 registrado · 400 inválido · 413 grande demais · 429 limite.
 */
export async function handleClientError(req: Request, now: Date = new Date()): Promise<Response> {
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_CLIENT_ERROR_BYTES) return refused(413, declared);
  let text: string;
  try {
    text = await req.text();
  } catch {
    return refused(400, declared);
  }
  const bytes = new TextEncoder().encode(text).length;
  if (bytes > MAX_CLIENT_ERROR_BYTES) return refused(413, bytes);
  const report = parseClientError(text);
  if (!report) return refused(400, bytes);
  const key = ipKey(clientIp(req.headers), now, rateLimitSalt() ?? "sem-sal");
  if (
    !(await checkRateLimit(`client-error:${key}`, CLIENT_ERROR_LIMIT, CLIENT_ERROR_WINDOW_SECONDS))
  )
    return refused(429, bytes);
  const ua = (req.headers.get("user-agent") ?? "").slice(0, 200);
  console.error(`client-error: ${report.message}`, { ...report, ua });
  return status(204);
}
