import { AGENDA_AGE_RATINGS, type AgendaAgeRating } from "@/content/pt-BR/studio-agenda";
import { fold } from "@/lib/text/fold";

/** Faixa etária da lista fechada (`event_listings.age_rating`, check da migration 0200). */
export type AgeRating = AgendaAgeRating;
export const AGE_RATING_VALUES = AGENDA_AGE_RATINGS;

const AGES = new Set(["10", "12", "14", "16", "18"]);

/**
 * A idade só conta colada ao sinal de classificação (o número logo depois dele), nunca o primeiro
 * "N anos" do texto. Texto já sem acento e em minúsculas (`fold`).
 */
const AGE_PATTERNS: readonly RegExp[] = [
  /classificacao(?: indicativa| etaria)?\s*:?\s*(\d{1,2})(?!\d)/g,
  /indicativ[ao]\s*:?\s*(\d{1,2})(?!\d)/g,
  /censura\s*:?\s*(\d{1,2})(?!\d)/g,
  /faixa etaria\s*:?\s*(\d{1,2})(?!\d)/g,
  /idade minima\s*:?\s*(\d{1,2})(?!\d)/g,
  /proibid[ao][^\d]{0,25}?(\d{1,2})(?!\d)/g,
  /(?:maiores|menores) de\s*(\d{1,2})(?!\d)/g,
  /a partir de\s*(\d{1,2})\s*anos(?![a-z])/g,
  /(?<![\d$])\+\s*(\d{1,2})(?![\d.,])(?!\s*(?:de |reais|r\$|%|taxa))/g,
  /(?<![\d.,$]\s?)(?<![\d.,])(\d{1,2})\s*\+(?!\s*\d)/g,
];

/** "menores de 12 anos não pagam": regra de ingresso, não classificação. */
const TICKET_CONTEXT =
  /^[^.;]{0,40}?(?:nao pag|pagam|gratis|gratuit|isent|meia|desconto|acompanhad|cortesia|entrada franca)/;

/** "Livre" só quando fala de classificação; "entrada livre" é preço, não faixa. */
const LIVRE =
  /classificacao(?: indicativa| etaria)?\s*:?\s*livre|(?:faixa etaria|publico|idade)\s*:?\s*livre|livre para (?:todos|todas)|^livre(?![a-z])/;

/**
 * Texto de classificação da fonte → valor fechado: "livre", "L", "classificação livre" → `livre`;
 * "classificação 16 anos", "+16", "18+", "classificação 14", "proibido para menores de 18" →
 * a idade (só 10, 12, 14, 16 e 18), sempre o número colado ao sinal de classificação. "N anos"
 * solto, regra de ingresso ("menores de 12 anos não pagam") e "entrada livre" não contam; o resto
 * (vazio, idade fora da lista, texto sem classificação) → `consulte`. Nunca adivinha.
 */
export function normalizeAgeRating(text: string | null | undefined): AgeRating {
  const t = fold(text ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!t) return "consulte";
  if ((AGE_RATING_VALUES as readonly string[]).includes(t)) return t as AgeRating;
  if (t === "l") return "livre";

  let first: { index: number; age: string } | null = null;
  for (const re of AGE_PATTERNS) {
    for (const m of t.matchAll(re)) {
      const end = (m.index ?? 0) + m[0].length;
      if (/^(?:maiores|menores)/.test(m[0]) && TICKET_CONTEXT.test(t.slice(end))) continue;
      if (!first || (m.index ?? 0) < first.index) first = { index: m.index ?? 0, age: m[1] ?? "" };
      break;
    }
  }
  if (first) return AGES.has(first.age) ? (first.age as AgeRating) : "consulte";
  return LIVRE.test(t) ? "livre" : "consulte";
}
