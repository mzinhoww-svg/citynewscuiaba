import { z } from "zod";
import { neighborhoodBySlug } from "@/content/pt-BR/neighborhoods";
import { SUGGEST } from "@/content/pt-BR/portal";
import { dayStart } from "@/lib/format/date";
import type { Result } from "@/lib/result";

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

export interface EventSubmission {
  title: string;
  startsAt: string;
  endsAt: string | null;
  venue: string;
  neighborhood: string | null;
  priceCents: number | null;
  ageRating: string;
  link: string | null;
  description: string | null;
  contactEmail: string;
}

type SaveError = { kind: "unconfigured" | "unavailable" };

export interface SubmitDeps {
  allow: () => Promise<Result<boolean, SaveError>>;
  save: (s: EventSubmission) => Promise<Result<void, SaveError>>;
  now?: () => Date;
}

/** "2026-10-10T19:00" (campo datetime-local) no relógio de Cuiabá → instante. */
export function parseLocalDateTime(raw: string): Date | null {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/.exec(raw.trim());
  if (!m) return null;
  const [, day, hh, mm] = m;
  const h = Number(hh);
  const min = Number(mm);
  if (h > 23 || min > 59) return null;
  const start = dayStart(day ?? "");
  if (Number.isNaN(start.getTime())) return null;
  return new Date(start.getTime() + (h * 60 + min) * 60_000);
}

function parsePrice(raw: string): number | null {
  const clean = raw.trim().replace(/^R\$\s*/i, "");
  if (!/^\d{1,5}(,\d{1,2})?$/.test(clean)) return null;
  const [reais = "0", cents = "0"] = clean.split(",");
  return Number(reais) * 100 + Number(cents.padEnd(2, "0"));
}

const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));

export async function submitEvent(form: FormData, deps: SubmitDeps): Promise<SubmitState> {
  const values: Partial<Record<SubmitField, string>> = {};
  for (const f of SUBMIT_FIELDS) values[f] = String(form.get(f) ?? "").slice(0, 2000);
  const v = (f: SubmitField) => (values[f] ?? "").trim();
  if (String(form.get(SUBMIT_HONEYPOT) ?? "").trim() !== "") {
    return { status: "success", message: SUGGEST.success, errors: {}, values: {} };
  }

  const now = deps.now?.() ?? new Date();
  const errors: Partial<Record<SubmitField, string>> = {};
  const title = v("title");
  if (title.length < 3 || title.length > 120) errors.title = SUGGEST.errors.title;

  const start = parseLocalDateTime(v("startsAt"));
  if (!start) errors.startsAt = SUGGEST.errors.startsAt;
  else if (start.getTime() < now.getTime()) errors.startsAt = SUGGEST.errors.startsPast;
  const end = v("endsAt") ? parseLocalDateTime(v("endsAt")) : null;
  if (v("endsAt") && (!end || (start && end.getTime() <= start.getTime()))) {
    errors.endsAt = SUGGEST.errors.endsAt;
  }

  const venue = v("venue");
  if (venue.length < 2 || venue.length > 160) errors.venue = SUGGEST.errors.venue;

  const free = v("free") === "1";
  const priceCents = free ? null : parsePrice(v("price"));
  if (!free && priceCents === null) errors.price = SUGGEST.errors.price;

  const link = v("link");
  if (link && !/^https:\/\/[^\s]+\.[^\s]+$/.test(link)) errors.link = SUGGEST.errors.link;

  const description = v("description");
  if (description.length > 500) errors.description = SUGGEST.errors.description;

  const email = emailSchema.safeParse(v("email"));
  if (!email.success) errors.email = SUGGEST.errors.email;
  if (v("consent") !== "1") errors.consent = SUGGEST.errors.consent;

  const count = Object.keys(errors).length;
  if (count > 0 || !start || !email.success) {
    return { status: "invalid", message: SUGGEST.summary(count), errors, values };
  }

  const allowed = await deps.allow();
  if (!allowed.ok) return { status: "error", message: SUGGEST.error, errors: {}, values };
  if (!allowed.value) {
    return { status: "rate_limited", message: SUGGEST.rateLimited, errors: {}, values };
  }

  const age = AGE_RATINGS.find((a) => a === v("ageRating")) ?? "livre";
  const saved = await deps.save({
    title,
    startsAt: start.toISOString(),
    endsAt: end ? end.toISOString() : null,
    venue,
    neighborhood: neighborhoodBySlug(v("neighborhood"))?.slug ?? null,
    priceCents: free || priceCents === 0 ? null : priceCents,
    ageRating: age,
    link: link || null,
    description: description || null,
    contactEmail: email.data,
  });
  if (!saved.ok) return { status: "error", message: SUGGEST.error, errors: {}, values };
  return { status: "success", message: SUGGEST.success, errors: {}, values: {} };
}
