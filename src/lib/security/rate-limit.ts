import { createHash } from "node:crypto";

/**
 * Chave de limite de uso a partir do IP: SHA-256 de IP + dia (UTC) + sal. O IP cru nunca é
 * gravado (rate_limits, A-028); a chave muda todo dia.
 */
export function ipKey(ip: string, now: Date, salt: string): string {
  const day = now.toISOString().slice(0, 10);
  return createHash("sha256").update(`${salt}:${day}:${ip}`).digest("hex");
}

/** IP do cliente atrás do proxy da Vercel: primeiro valor de `x-forwarded-for`. */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip")?.trim() || "desconhecido";
}

/** Sal do hash de IP: segredo do servidor (nunca exposto ao navegador). */
export function rateLimitSalt(): string {
  return process.env.RATE_LIMIT_SALT ?? process.env.CRON_SECRET ?? "citynews";
}

const memoryHits = new Map<string, number>();

/**
 * Limite em janela fixa guardado em memória da instância: 5/h = `checkRateLimit(k, 5, 3600)`.
 * `now` em segundos. Serve para testes e como proteção local; o limite de verdade dos
 * formulários públicos é o compartilhado no banco (`hitRateLimit`, 0003_rate_limits), porque
 * cada instância da Vercel tem a própria memória.
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowSec: number,
  now: number = Date.now() / 1000,
): Promise<boolean> {
  const window = Math.floor(now / windowSec);
  const slot = `${key}:${windowSec}:${window}`;
  const hits = (memoryHits.get(slot) ?? 0) + 1;
  memoryHits.set(slot, hits);
  if (memoryHits.size > 10_000) {
    for (const k of memoryHits.keys()) if (!k.endsWith(`:${window}`)) memoryHits.delete(k);
  }
  return hits <= limit;
}
