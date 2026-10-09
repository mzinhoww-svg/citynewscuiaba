import { err, ok, type Result } from "@/lib/result";
import { AGENDA_LIST } from "./agenda-edition";
import { escapeHtml, UNSUBSCRIBE_PLACEHOLDER, type RenderedEmail } from "./email-html";
import { signNewsletterToken } from "./token";

/**
 * Envio da edição (ARD-T5, spec §6): porta `EmailSender`. Ainda não há provedor de e-mail
 * (B-005): a implementação padrão não envia e devolve `aguardando_provedor`, sem falhar; a
 * edição continua publicada na web; `aguardando_provedor` é o estado final de exibição até
 * existir provedor. Um provedor real entra aqui, em `senderFromEnv`.
 *
 * Antes de ligar um provedor (B-005 em .planning/BLOCKERS.md):
 * - trava de "claim" antes do envio (`published → enviando` condicional no banco), para duas
 *   rodadas (quinta e a nova tentativa de sexta) nunca enviarem duas vezes;
 * - link de descadastro que não expira e cabeçalho `List-Unsubscribe` (hoje o link vale 60 dias);
 * - alinhar a mensagem de link expirado das preferências (hoje diz 7 dias);
 * - cada destinatário recebe o e-mail com `personalize` (o marcador vira o link dele).
 */

export interface Recipient {
  email: string;
  /** Link assinado das preferências (sair da lista), trocado no lugar de `{{unsubscribe_url}}`. */
  unsubscribeUrl: string;
}

export type SendOutcome = { status: "sent"; count: number } | { status: "aguardando_provedor" };
export interface SendError {
  kind: "provider_error";
  message: string;
}

export interface EmailSender {
  /** Nome do provedor nos registros (`none` sem provedor). */
  name: string;
  send(
    edition: RenderedEmail,
    recipients: readonly Recipient[],
  ): Promise<Result<SendOutcome, SendError>>;
}

/** Sem provedor configurado: nada sai e a edição fica `aguardando_provedor`. */
export const noProviderSender: EmailSender = {
  name: "none",
  send: async () => ok({ status: "aguardando_provedor" }),
};

/** Provedor de e-mail do ambiente. Hoje só existe o "nenhum provedor" (B-005). */
export function senderFromEnv(): EmailSender {
  return noProviderSender;
}

/** Links de descadastro do e-mail valem 60 dias (a edição pode ser lida semanas depois). */
export const UNSUBSCRIBE_TTL_SEC = 60 * 24 * 3600;

/** Link das preferências da lista `agenda-fds` para este e-mail, ou `null` sem segredo. */
export function unsubscribeUrl(
  email: string,
  siteUrl: string,
  secret: string | null,
): string | null {
  if (!secret) return null;
  const token = signNewsletterToken(
    "newsletter",
    email,
    [AGENDA_LIST],
    UNSUBSCRIBE_TTL_SEC,
    secret,
  );
  return `${siteUrl.replace(/\/+$/, "")}/newsletter/preferencias?token=${encodeURIComponent(token)}`;
}

/**
 * Destinatários com o link de descadastro de cada um. Sem segredo não há link, e e-mail sem
 * descadastro não sai: `no_secret`.
 */
export function buildRecipients(
  emails: readonly string[],
  siteUrl: string,
  secret: string | null,
): Result<Recipient[], "no_secret"> {
  if (!secret) return err("no_secret");
  const seen = new Set<string>();
  const out: Recipient[] = [];
  for (const raw of emails) {
    const email = raw.trim().toLowerCase();
    if (!email || seen.has(email)) continue;
    seen.add(email);
    const url = unsubscribeUrl(email, siteUrl, secret);
    if (url) out.push({ email, unsubscribeUrl: url });
  }
  return ok(out);
}

/** E-mail de um destinatário: o marcador vira o link dele (escapado no HTML). */
export function personalize(e: RenderedEmail, url: string): RenderedEmail {
  return {
    subject: e.subject,
    html: e.html.split(UNSUBSCRIBE_PLACEHOLDER).join(escapeHtml(url)),
    text: e.text.split(UNSUBSCRIBE_PLACEHOLDER).join(url),
  };
}
