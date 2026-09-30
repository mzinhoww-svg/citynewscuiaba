/**
 * Token de gestão da inscrição (D-P13): 32 bytes aleatórios devolvidos uma vez ao navegador;
 * no banco só o SHA-256. Alterar ou apagar a inscrição exige o token no `Authorization`.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export function newManageToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Compara o token apresentado com o hash guardado em tempo constante. */
export function tokenMatches(token: string | null, hash: string): boolean {
  if (!token) return false;
  const a = Buffer.from(hashToken(token), "hex");
  const b = Buffer.from(hash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** `Authorization: Bearer <token>` da requisição, ou `null`. */
export function bearer(req: Request): string | null {
  const h = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+([A-Za-z0-9_-]{16,128})$/.exec(h.trim());
  return m ? m[1]! : null;
}
