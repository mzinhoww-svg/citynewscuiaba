import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

const digest = (s: string): Buffer => createHash("sha256").update(s, "utf8").digest();

/**
 * Rotas de cron e worker exigem `Authorization: Bearer ${CRON_SECRET}` (CLAUDE.md §8).
 * Compara resumos SHA-256 de tamanho fixo com `timingSafeEqual`: o tempo não revela o segredo
 * nem o tamanho dele. Sem segredo configurado, recusa tudo (falha fechado).
 */
export function isCronAuthorized(header: string | null, secret: string | undefined): boolean {
  if (!secret) return false;
  const match = /^Bearer (.+)$/.exec(header ?? "");
  const token = match?.[1] ?? "";
  const equal = timingSafeEqual(digest(token), digest(secret));
  return equal && token.length > 0;
}

export function unauthorized(): Response {
  return Response.json({ error: "unauthorized" }, { status: 401 });
}
