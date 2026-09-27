/** Estado do formulário da newsletter, sem zod: importável por Client Components. */
export type NewsletterStatus = "idle" | "success" | "invalid" | "rate_limited" | "error";

export interface NewsletterState {
  status: NewsletterStatus;
  message: string;
  /** E-mail digitado, preservado quando há erro. */
  email: string;
}

export const NEWSLETTER_IDLE: NewsletterState = { status: "idle", message: "", email: "" };

/** Campo-armadilha: invisível para pessoas; robôs preenchem. */
export const HONEYPOT_FIELD = "website";
