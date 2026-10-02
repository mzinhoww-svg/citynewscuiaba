import { createHmac, timingSafeEqual } from "node:crypto";
import { err, ok, type Result } from "@/lib/result";

/**
 * Link assinado da newsletter e dos alertas por e-mail (P19, P18): `payload.assinatura`, com
 * payload em base64url `{ p, e, l, x }` (finalidade, e-mail, listas, expiração em segundos) e
 * HMAC-SHA256. A finalidade (`newsletter` ou `alert`) é conferida em cada rota: um link de
 * alerta não abre o centro de preferências da newsletter (gate P2, M11).
 * Serve para confirmar a inscrição (confirmação dupla) e abrir o centro de preferências sem
 * conta. Nada no token é secreto; só a assinatura impede forjar outro e-mail.
 */
type SecretEnv = Partial<Record<"NODE_ENV" | "NEWSLETTER_TOKEN_SECRET" | "CRON_SECRET", string>>;

const DEV_SECRET = "citynews-dev-newsletter";

/** Segredo do servidor; em produção sem segredo, `null` (links recusados, falha fechada). */
export function newsletterSecret(env: SecretEnv = process.env): string | null {
  const s = env.NEWSLETTER_TOKEN_SECRET?.trim() || env.CRON_SECRET?.trim();
  if (s) return s;
  return env.NODE_ENV === "production" ? null : DEV_SECRET;
}

export type LinkPurpose = "newsletter" | "alert";

const sign = (payload: string, secret: string) =>
  createHmac("sha256", secret).update(`citynews-link:${payload}`).digest("base64url");

export function signNewsletterToken(
  purpose: LinkPurpose,
  email: string,
  lists: string[],
  expSec: number,
  secret: string | null = newsletterSecret(),
): string {
  if (!secret) throw new Error("newsletter: segredo ausente");
  const x = Math.floor(Date.now() / 1000) + Math.floor(expSec);
  const payload = Buffer.from(
    JSON.stringify({ p: purpose, e: email.trim().toLowerCase(), l: lists, x }),
  ).toString("base64url");
  return `${payload}.${sign(payload, secret)}`;
}

export function verifyNewsletterToken(
  token: string,
  purpose: LinkPurpose,
  secret: string | null = newsletterSecret(),
): Result<{ email: string; lists: string[] }, "expired" | "invalid"> {
  if (!secret) return err("invalid");
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return err("invalid");
  const [payload, given] = parts as [string, string];
  const expected = Buffer.from(sign(payload, secret));
  const got = Buffer.from(given);
  if (got.length !== expected.length || !timingSafeEqual(got, expected)) return err("invalid");
  let data: unknown;
  try {
    data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return err("invalid");
  }
  if (typeof data !== "object" || data === null) return err("invalid");
  const d = data as { p?: unknown; e?: unknown; l?: unknown; x?: unknown };
  if (d.p !== purpose) return err("invalid");
  if (typeof d.e !== "string" || typeof d.x !== "number" || !Array.isArray(d.l))
    return err("invalid");
  const lists = d.l.filter((v): v is string => typeof v === "string");
  if (d.x < Math.floor(Date.now() / 1000)) return err("expired");
  return ok({ email: d.e, lists });
}
