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
