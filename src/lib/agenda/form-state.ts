/** Estado do formulário "Sugerir evento", sem zod: importável por Client Components. */
/** Sugestão de evento de leitor (P11) → fila `event_submissions` do Estúdio (E13). */
export const SUBMIT_FIELDS = [
  "title",
  "startsAt",
  "endsAt",
  "venue",
  "neighborhood",
  "free",
  "price",
  "ageRating",
  "link",
  "description",
  "email",
  "consent",
] as const;
export type SubmitField = (typeof SUBMIT_FIELDS)[number];

export const AGE_RATINGS = ["livre", "10", "12", "14", "16", "18"] as const;
export const SUBMIT_HONEYPOT = "website";
export const SUBMIT_LIMIT = 5;
export const SUBMIT_WINDOW_SECONDS = 3600;

export interface SubmitState {
  status: "idle" | "success" | "invalid" | "rate_limited" | "error";
  message: string;
  errors: Partial<Record<SubmitField, string>>;
  /** O que foi digitado, devolvido para o formulário não perder nada. */
  values: Partial<Record<SubmitField, string>>;
}

export const SUBMIT_IDLE: SubmitState = { status: "idle", message: "", errors: {}, values: {} };

/** Formulário de evento do Estúdio (AGM-T7): erro por campo e o que foi digitado. */
export interface EventFormState {
  status: "idle" | "invalid" | "error";
  message: string;
  errors: Partial<Record<string, string>>;
  values: Partial<Record<string, string>>;
}

export const EVENT_FORM_IDLE: EventFormState = {
  status: "idle",
  message: "",
  errors: {},
  values: {},
};

/** Campo do seletor de lugar do Guia (Estúdio): vazio = automático; `VENUE_NONE` = sem vínculo. */
export const VENUE_FIELD = "venueId";
export const VENUE_NONE = "nenhum";
