import { AGENDA_AGE_RATINGS, STUDIO_AGENDA_TEXT } from "@/content/pt-BR/studio-agenda";
import { AGENDA_CATEGORIES } from "@/lib/filters/agenda";
import { toZonedIso } from "@/lib/format/date";
import { err, ok, type Result } from "@/lib/result";
import { fold } from "@/lib/text/fold";
import { hasProfanity, suspiciousLink } from "./approve";
import { parseLocalDateTime } from "./submission";

const E = STUDIO_AGENDA_TEXT.errors;

/** Campos do formulário de evento do Estúdio (nome do `<input>` = chave do erro). */
export const EVENT_FORM_FIELDS = [
  "title",
  "startsAt",
  "endsAt",
  "venue",
  "neighborhood",
  "price",
  "priceUnknown",
  "category",
  "ageRating",
  "accessibility",
  "link",
  "description",
] as const;
export type EventFormField = (typeof EVENT_FORM_FIELDS)[number];

/** Evento como a redação o cadastra ou edita (instantes em ISO UTC). */
export interface EventInput {
  title: string;
  startsAt: string;
  endsAt: string | null;
  venue: string;
  neighborhood: string | null;
  /** `null` com `priceUnknown`; 0 = gratuito. */
  priceCents: number | null;
  priceUnknown: boolean;
  category: string;
  ageRating: string;
  accessibility: string | null;
  /** Link oficial (`event_listings.source_url`). */
  sourceUrl: string | null;
  description: string | null;
  /**
   * Lugar do Guia escolhido pela redação (`event_listings.venue_id`): ausente = automático pelo
   * local (`matchVenue`, sem trava); uuid = escolha (trava); `null` = sem vínculo (trava).
   */
  venueId?: string | null;
}

/** Campo do seletor de lugar do Guia: vazio = automático; `VENUE_NONE` = sem vínculo. */
export const VENUE_FIELD = "venueId";
export const VENUE_NONE = "nenhum";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Escolha de lugar do formulário: `undefined` (automático), uuid ou `null` (nenhum). */
function venueChoice(fd: FormData): string | null | undefined {
  const raw = String(fd.get(VENUE_FIELD) ?? "").trim();
  if (raw === VENUE_NONE) return null;
  return UUID.test(raw) ? raw.toLowerCase() : undefined;
}

export type EventFormErrors = Partial<Record<EventFormField, string>>;

export interface ParseEventOptions {
  now?: Date;
  /** `create` exige início no futuro; `edit` aceita evento já começado ou encerrado. */
  mode?: "create" | "edit";
}

const UNKNOWN_PRICE = new Set(["nao informado", "nao informada", "sem informacao"]);
const FREE_PRICE = new Set(["gratis", "gratuito", "gratuita"]);

/** "40", "25,50", "R$ 1.250,50", "grátis" → centavos; texto solto → `null`. */
function parsePriceCents(raw: string): number | null {
  const folded = fold(raw.trim());
  if (FREE_PRICE.has(folded)) return 0;
  const clean = raw
    .trim()
    .replace(/^R\$\s*/i, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "");
  if (!/^\d{1,6}(,\d{1,2})?$/.test(clean)) return null;
  const [reais = "0", cents = "0"] = clean.split(",");
  return Number(reais) * 100 + Number(cents.padEnd(2, "0"));
}

/** Frases do texto: trechos terminados por ., ! ou ? (o último pode ficar sem ponto). */
function sentenceCount(text: string): number {
  return text
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .filter((s) => /[\p{L}\p{N}]/u.test(s)).length;
}

/** Instante → valor de `<input type="datetime-local">` no relógio de Cuiabá. */
export function toLocalInput(iso: string | null): string {
  return iso ? toZonedIso(iso).slice(0, 16) : "";
}

/** Colunas guardadas que o formulário de edição mostra. */
export interface StoredEventFields {
  title: string;
  starts_at: string;
  ends_at: string | null;
  venue: string;
  neighborhood: string | null;
  price_cents: number | null;
  price_unknown: boolean;
  category: string;
  age_rating: string;
  accessibility: string | null;
  source_url: string | null;
  description: string | null;
}

/**
 * Evento guardado → valores do formulário. Preço nulo (evento antigo, sem informação) já vem
 * marcado como "Preço não informado": editar outro campo não obriga a inventar um preço.
 */
export function eventFormValues(e: StoredEventFields): Record<EventFormField, string> {
  const unknown = e.price_unknown || e.price_cents === null;
  return {
    title: e.title,
    startsAt: toLocalInput(e.starts_at),
    endsAt: toLocalInput(e.ends_at),
    venue: e.venue,
    neighborhood: e.neighborhood ?? "",
    price:
      unknown || e.price_cents === null
        ? ""
        : (e.price_cents / 100).toFixed(2).replace(".", ",").replace(/,00$/, ""),
    priceUnknown: unknown ? "1" : "",
    category: e.category,
    ageRating: e.age_rating,
    accessibility: e.accessibility ?? "",
    link: e.source_url ?? "",
    description: e.description ?? "",
  };
}

/**
 * Valida o formulário de evento do Estúdio (AGM-T7). Erro por campo, com exemplo; a página
 * devolve o que foi digitado. Título 3–140 e sem palavrão; início obrigatório (futuro no
 * cadastro); fim ≥ início; local obrigatório; preço em reais ou "não informado"; categoria e
 * faixa etária das listas; link `https` sem encurtador; descrição de até 2 frases e 300 caracteres.
 */
export function parseEventForm(
  fd: FormData,
  options: ParseEventOptions = {},
): Result<EventInput, EventFormErrors> {
  const now = options.now ?? new Date();
  const mode = options.mode ?? "create";
  const v = (f: EventFormField) => String(fd.get(f) ?? "").trim();
  const errors: EventFormErrors = {};

  const title = v("title").replace(/\s+/g, " ");
  if (title.length < 3 || title.length > 140) errors.title = E.title;
  else if (hasProfanity(title)) errors.title = E.profanity;

  const start = v("startsAt") ? parseLocalDateTime(v("startsAt")) : null;
  if (!start) errors.startsAt = E.startsAt;
  else if (mode === "create" && start.getTime() <= now.getTime()) errors.startsAt = E.startsPast;

  const end = v("endsAt") ? parseLocalDateTime(v("endsAt")) : null;
  if (v("endsAt") && (!end || (start && end.getTime() < start.getTime()))) errors.endsAt = E.endsAt;

  const venue = v("venue").replace(/\s+/g, " ");
  if (venue.length < 2 || venue.length > 160) errors.venue = E.venue;

  const neighborhood = v("neighborhood").replace(/\s+/g, " ");
  if (neighborhood.length > 80) errors.neighborhood = E.neighborhood;

  const priceText = v("price");
  const priceUnknown = v("priceUnknown") === "1" || UNKNOWN_PRICE.has(fold(priceText));
  const priceCents = priceUnknown ? null : parsePriceCents(priceText);
  if (!priceUnknown && priceCents === null) errors.price = E.price;

  const category = v("category");
  if (!(AGENDA_CATEGORIES as readonly string[]).includes(category)) errors.category = E.category;

  const ageRating = v("ageRating");
  if (!(AGENDA_AGE_RATINGS as readonly string[]).includes(ageRating))
    errors.ageRating = E.ageRating;

  const accessibility = v("accessibility");
  if (accessibility.length > 200) errors.accessibility = E.accessibility;

  const link = v("link");
  if (link && suspiciousLink(link)) errors.link = E.link;

  const description = v("description").replace(/\s+/g, " ");
  if (description.length > 300 || sentenceCount(description) > 2)
    errors.description = E.description;
  else if (description && hasProfanity(description)) errors.description = E.profanity;

  if (Object.keys(errors).length > 0 || !start) return err(errors);
  const venueId = venueChoice(fd);
  return ok({
    title,
    startsAt: start.toISOString(),
    endsAt: end ? end.toISOString() : null,
    venue,
    neighborhood: neighborhood || null,
    priceCents,
    priceUnknown,
    category,
    ageRating,
    accessibility: accessibility || null,
    sourceUrl: link || null,
    description: description || null,
    ...(venueId !== undefined ? { venueId } : {}),
  });
}
