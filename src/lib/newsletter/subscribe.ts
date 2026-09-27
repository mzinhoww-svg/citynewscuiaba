import { z } from "zod";
import { NEWSLETTER } from "@/content/pt-BR/portal";
import type { Result } from "@/lib/result";
import { HONEYPOT_FIELD, type NewsletterState } from "./form-state";

export {
  HONEYPOT_FIELD,
  NEWSLETTER_IDLE,
  type NewsletterState,
  type NewsletterStatus,
} from "./form-state";

export type SaveError = { kind: "unconfigured" | "unavailable" };

export interface SubscribeDeps {
  /** Registra o uso e diz se ainda está dentro do limite. */
  allow: () => Promise<Result<boolean, SaveError>>;
  save: (email: string, list: string) => Promise<Result<void, SaveError>>;
}

/** Lista padrão (spec §5: newsletter só com e-mail). */
export const NEWSLETTER_LIST = "diaria";

const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));

/** Inscrição na newsletter (P01): valida, aplica honeypot e limite de uso, grava. */
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

  const allowed = await deps.allow();
  if (!allowed.ok) return { status: "error", message: NEWSLETTER.error, email: raw };
  if (!allowed.value)
    return { status: "rate_limited", message: NEWSLETTER.rateLimited, email: raw };

  const saved = await deps.save(parsed.data, NEWSLETTER_LIST);
  if (!saved.ok) return { status: "error", message: NEWSLETTER.error, email: raw };
  return { status: "success", message: NEWSLETTER.success, email: "" };
}
