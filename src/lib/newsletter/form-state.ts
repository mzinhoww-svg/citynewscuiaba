/** Estado do formulário da newsletter, sem zod: importável por Client Components. */
export type NewsletterStatus =
  "idle" | "success" | "already" | "invalid" | "rate_limited" | "error";

export interface NewsletterState {
  status: NewsletterStatus;
  message: string;
  /** E-mail digitado, preservado quando há erro. */
  email: string;
  /** Campo com erro (a escolha de listas, na página /newsletter). */
  field?: "email" | "lists";
}

export const NEWSLETTER_IDLE: NewsletterState = { status: "idle", message: "", email: "" };

/** Campo-armadilha: invisível para pessoas; robôs preenchem. */
export const HONEYPOT_FIELD = "website";

/** Presente quando o formulário mostra a escolha de listas (sem ele, vale a diária). */
export const LISTS_PICKED_FIELD = "picked";
