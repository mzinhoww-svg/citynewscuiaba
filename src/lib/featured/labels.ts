import { formatDateTime, formatHour, localDateKey } from "@/lib/format/date";

const DAY_MS = 86_400_000;

/**
 * Remover uma fixação pede confirmação digitada só quando ela ainda vale por mais de 24 h (ou
 * não tem prazo, R28); até 24 h a remoção é direta.
 */
export function removalNeedsTyping(endsAt: string | null, now: Date): boolean {
  if (endsAt === null) return true;
  return Date.parse(endsAt) - now.getTime() > DAY_MS;
}

/** Horas que faltam (arredondadas para cima) para o fim da fixação; `null` sem prazo. */
export function hoursLeft(endsAt: string | null, now: Date): number | null {
  if (endsAt === null) return null;
  return Math.max(0, Math.ceil((Date.parse(endsAt) - now.getTime()) / 3_600_000));
}

/** "15h" quando o fim é hoje (fuso de Cuiabá); com data nos outros dias. */
export function untilText(iso: string, now: Date): string {
  return localDateKey(iso) === localDateKey(now) ? formatHour(iso) : formatDateTime(iso);
}
