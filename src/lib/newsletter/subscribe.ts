import { z } from "zod";
import { NEWSLETTER_LISTS, NEWSLETTER_MAIL, NEWSLETTER_PAGE } from "@/content/pt-BR/newsletter";
import { NEWSLETTER } from "@/content/pt-BR/newsletter";
import type { Result } from "@/lib/result";
import { HONEYPOT_FIELD, LISTS_PICKED_FIELD, type NewsletterState } from "./form-state";

export {
  HONEYPOT_FIELD,
  LISTS_PICKED_FIELD,
  NEWSLETTER_IDLE,
  type NewsletterState,
  type NewsletterStatus,
} from "./form-state";

export type SaveError = { kind: "unconfigured" | "unavailable" };

/** E-mail para quem não tem conta: fica na fila `reader_emails` até haver provedor (B-005). */
export interface ReaderEmail {
  kind: "newsletter_confirm" | "newsletter_manage" | "alert_confirm";
  to: string;
  subject: string;
  body: string;
  /**
   * O que a mensagem confirma (`alert:<id>` ou `lists:<ids>`). O dedupe de 10 min é por
   * endereço, tipo e referência: outro alerta ou outra lista ganha a própria mensagem (I4).
   */
  ref: string;
}

export interface SubscribeDeps {
  /** Registra o uso e diz se ainda está dentro do limite. */
  allow: () => Promise<Result<boolean, SaveError>>;
  /** Grava as listas sem confirmação; devolve as que já estavam confirmadas e ativas. */
  save: (email: string, lists: string[]) => Promise<Result<{ alreadyActive: string[] }, SaveError>>;
  queue: (mail: ReaderEmail) => Promise<Result<void, SaveError>>;
  /** Link assinado do centro de preferências (com `confirmar=1` na confirmação dupla). */
  link: (email: string, lists: string[], confirm: boolean) => string | null;
}

/** Lista padrão do formulário da home (só e-mail). */
export const NEWSLETTER_LIST = "diaria";
export const LIST_IDS: readonly string[] = NEWSLETTER_LISTS.map((l) => l.id);

const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));

export const listNames = (ids: string[]) =>
  NEWSLETTER_LISTS.filter((l) => ids.includes(l.id))
    .map((l) => `"${l.name}"`)
    .join(", ");

/**
 * Inscrição na newsletter sem conta (P01, P19): valida, aplica honeypot e limite, grava as
 * listas sem confirmação e põe na fila o e-mail de confirmação dupla. Quem já recebe tudo o que
 * pediu ganha o link de preferências (estado "já inscrito").
 */
export async function subscribeNewsletter(
  form: FormData,
  deps: SubscribeDeps,
): Promise<NewsletterState> {
  const raw = String(form.get("email") ?? "");
  if (String(form.get(HONEYPOT_FIELD) ?? "").trim() !== "") {
    return { status: "success", message: NEWSLETTER.success, email: "" };
  }
  const parsed = emailSchema.safeParse(raw);
  if (!parsed.success) return { status: "invalid", message: NEWSLETTER.invalid, email: raw };

  const picked = form.get(LISTS_PICKED_FIELD) !== null;
  const asked = form.getAll("lists").map(String);
  const lists = picked
    ? LIST_IDS.filter((id) => asked.includes(id))
    : asked.length
      ? LIST_IDS.filter((id) => asked.includes(id))
      : [NEWSLETTER_LIST];
  if (lists.length === 0)
    return {
      status: "invalid",
      message: NEWSLETTER_PAGE.listsRequired,
      email: raw,
      field: "lists",
    };

  const allowed = await deps.allow();
  if (!allowed.ok) return { status: "error", message: NEWSLETTER.error, email: raw };
  if (!allowed.value)
    return { status: "rate_limited", message: NEWSLETTER.rateLimited, email: raw };

  const email = parsed.data;
  const saved = await deps.save(email, lists);
  if (!saved.ok) return { status: "error", message: NEWSLETTER.error, email: raw };

  const already = lists.every((l) => saved.value.alreadyActive.includes(l));
  const link = deps.link(email, lists, !already);
  if (!link) return { status: "error", message: NEWSLETTER.error, email: raw };
  const ref = `lists:${[...lists].sort().join(",")}`;
  const queued = await deps.queue(
    already
      ? {
          kind: "newsletter_manage",
          to: email,
          subject: NEWSLETTER_MAIL.manageSubject,
          body: NEWSLETTER_MAIL.manageBody(link),
          ref,
        }
      : {
          kind: "newsletter_confirm",
          to: email,
          subject: NEWSLETTER_MAIL.confirmSubject,
          body: NEWSLETTER_MAIL.confirmBody(listNames(lists), link),
          ref,
        },
  );
  if (!queued.ok) return { status: "error", message: NEWSLETTER.error, email: raw };
  return already
    ? { status: "already", message: NEWSLETTER_PAGE.already, email: "" }
    : { status: "success", message: NEWSLETTER.success, email: "" };
}
