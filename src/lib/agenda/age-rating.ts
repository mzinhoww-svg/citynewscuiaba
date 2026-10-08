import { AGENDA_AGE_RATINGS, type AgendaAgeRating } from "@/content/pt-BR/studio-agenda";
import { fold } from "@/lib/text/fold";

/** Faixa etária da lista fechada (`event_listings.age_rating`, check da migration 0200). */
export type AgeRating = AgendaAgeRating;
export const AGE_RATING_VALUES = AGENDA_AGE_RATINGS;

const AGES = new Set(["10", "12", "14", "16", "18"]);
/** Sinais de classificação etária perto de "N anos". */
const CUE =
  /classificacao|indicativ|censura|maiores de|menores de|proibid|\+\s*\d{1,2}(?!\d)|(?<!\d)\d{1,2}\s*\+/;

/**
 * Texto de classificação da fonte → valor fechado: "livre", "L", "classificação livre" → `livre`;
 * "classificação 16 anos", "+16", "18+", "classificação 14", "proibido para menores de 18 anos" →
 * a idade (só 10, 12, 14, 16 e 18); "N anos" sem sinal de classificação não conta; o resto
 * (vazio, idade fora da lista, texto sem classificação) → `consulte`. Nunca adivinha.
 */
export function normalizeAgeRating(text: string | null | undefined): AgeRating {
  const t = fold(text ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!t) return "consulte";
  if ((AGE_RATING_VALUES as readonly string[]).includes(t)) return t as AgeRating;
  if (t === "l" || /(?<![a-z])livre(?![a-z])/.test(t)) return "livre";
  // "N anos" sozinho não é classificação ("crianças até 12 anos não pagam"): só com um sinal dela.
  const cue = CUE.test(t);
  const m =
    (cue ? /(?<!\d)(\d{1,2})\s*anos(?![a-z])/.exec(t) : null) ??
    /\+\s*(\d{1,2})(?!\d)/.exec(t) ??
    /(?<!\d)(\d{1,2})\s*\+/.exec(t) ??
    /classificacao(?: indicativa)?\s*:?\s*(\d{1,2})(?!\d)/.exec(t);
  const age = m?.[1];
  return age && AGES.has(age) ? (age as AgeRating) : "consulte";
}
