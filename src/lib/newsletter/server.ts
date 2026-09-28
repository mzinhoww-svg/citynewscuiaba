import "server-only";
import { hitRateLimit, queueReaderEmail, saveNewsletterLists } from "@/lib/db/writes";
import { ok } from "@/lib/result";
import { siteUrl } from "@/lib/seo/jsonld";
import { clientRateKey } from "@/lib/security/rate-limit";
import type { SubscribeDeps } from "./subscribe";
import { signNewsletterToken, newsletterSecret, type LinkPurpose } from "./token";

/** Links de confirmação e preferências valem 7 dias. */
export const LINK_TTL_SEC = 7 * 24 * 3600;
/** Limite dos formulários de newsletter e alerta por e-mail: 5 por hora por conexão. */
export const NEWSLETTER_LIMIT = 5;
const HOUR = 3600;

/** Link assinado absoluto para o e-mail (ou `null` sem segredo em produção). */
export function signedLink(
  purpose: LinkPurpose,
  path: string,
  email: string,
  lists: string[],
  extra = "",
): string | null {
  const secret = newsletterSecret();
  if (!secret) return null;
  const token = signNewsletterToken(purpose, email, lists, LINK_TTL_SEC, secret);
  return `${siteUrl()}${path}?token=${encodeURIComponent(token)}${extra}`;
}

/** Dependências reais da inscrição (banco, fila de e-mail, limite por IP com hash). */
export function subscribeDeps(headers: Headers, bucket = "newsletter"): SubscribeDeps {
  const key = clientRateKey(headers, new Date());
  return {
    allow: () =>
      key === null ? Promise.resolve(ok(false)) : hitRateLimit(bucket, key, NEWSLETTER_LIMIT, HOUR),
    save: saveNewsletterLists,
    queue: queueReaderEmail,
    link: (email, lists, confirm) =>
      signedLink(
        "newsletter",
        "/newsletter/preferencias",
        email,
        lists,
        confirm ? "&confirmar=1" : "",
      ),
  };
}
