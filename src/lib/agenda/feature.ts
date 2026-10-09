import { addDays, dayStart, localDateKey } from "@/lib/format/date";
import { err, ok, type Result } from "@/lib/result";

/** Destaque mais longo que o Estúdio aceita (B5): evita destaque esquecido por meses. */
export const FEATURE_MAX_DAYS = 90;

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * "Destacar até {data}" (B5): o dia escolhido (AAAA-MM-DD, de hoje até `FEATURE_MAX_DAYS`) vira o
 * último segundo desse dia em Cuiabá, o valor de `event_listings.featured_until`.
 */
export function featuredUntilOf(raw: string, now: Date = new Date()): Result<string, "invalid"> {
  if (!DAY.test(raw)) return err("invalid");
  const check = new Date(`${raw}T12:00:00Z`);
  if (Number.isNaN(check.getTime()) || check.toISOString().slice(0, 10) !== raw)
    return err("invalid");
  const today = localDateKey(now);
  if (raw < today || raw > addDays(today, FEATURE_MAX_DAYS)) return err("invalid");
  return ok(new Date(dayStart(addDays(raw, 1)).getTime() - 1000).toISOString());
}

/** Valor do campo de data a partir do destaque guardado (dia local de Cuiabá). */
export function featureDateInput(featuredUntil: string | null): string {
  return featuredUntil ? localDateKey(featuredUntil) : "";
}

/** "10/10": dia e mês locais (Cuiabá) do fim do destaque, para "Em destaque até dd/mm". */
export function featureDayLabel(featuredUntil: string): string {
  const [, m = "", d = ""] = localDateKey(featuredUntil).split("-");
  return `${d}/${m}`;
}
