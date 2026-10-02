/**
 * Sinal fraco e leitura qualificada (spec §7.2, tracking-plan §3).
 *
 * Fraco se qualquer: permanência < 10 s; rolagem < 25%; interação única isolada da fonte nos
 * últimos 14 dias; volta em < 5 s. Sinais fracos são guardados, mas têm peso 0 no score
 * individual até se repetirem em 3 dias diferentes (`promotesWeakSignal`).
 */
export interface SignalReading {
  seconds: number;
  scrollPct: number;
  /** Única interação com a fonte nos últimos 14 dias (`isIsolatedInteraction`). */
  isolated: boolean;
  /** Tempo até voltar (clique seguido de volta), quando houve. */
  bouncedMs?: number;
}

export const WEAK_MIN_SECONDS = 10;
export const WEAK_MIN_SCROLL = 25;
export const WEAK_BOUNCE_MS = 5000;
export const ISOLATION_DAYS = 14;
export const WEAK_PROMOTION_DAYS = 3;

export function isWeakSignal(r: SignalReading): boolean {
  return (
    r.seconds < WEAK_MIN_SECONDS ||
    r.scrollPct < WEAK_MIN_SCROLL ||
    r.isolated ||
    (r.bouncedMs !== undefined && r.bouncedMs < WEAK_BOUNCE_MS)
  );
}

/** Leitura qualificada: (≥ 30 s e rolagem ≥ 50%) ou ≥ 60 s. */
export function isQualifiedRead(seconds: number, scrollPct: number): boolean {
  return (seconds >= 30 && scrollPct >= 50) || seconds >= 60;
}

/** Só uma interação com a fonte nos últimos 14 dias (contando a atual)? */
export function isIsolatedInteraction(interactionsAt: string[], now: Date): boolean {
  const cutoff = now.getTime() - ISOLATION_DAYS * 86_400_000;
  return interactionsAt.filter((at) => Date.parse(at) >= cutoff).length <= 1;
}

const cuiabaDay = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Cuiaba",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** O sinal fraco se repetiu em 3 dias diferentes (no fuso de Cuiabá)? Então passa a contar. */
export function promotesWeakSignal(occurrencesAt: string[]): boolean {
  const days = new Set(
    occurrencesAt
      .map((at) => new Date(at))
      .filter((d) => !Number.isNaN(d.getTime()))
      .map((d) => cuiabaDay.format(d)),
  );
  return days.size >= WEAK_PROMOTION_DAYS;
}
