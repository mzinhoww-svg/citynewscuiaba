/**
 * Frequência e vencimento por janela (spec §7.8, D-F15, D-F17, D-F28). Ciclo normal: janelas de
 * 30 min (`windowStart`). Via rápida (frequência efetiva < 30 min): janelas de 10 min
 * (`fastWindowStart`), com a grade do próprio F (10/15/20) contada em cima delas.
 */
import { FAST_WINDOW_MINUTES, fastWindowStart, windowStart } from "@/lib/pipeline/window";
import { FAST_FREQUENCIES } from "./schema";

const NORMAL_WINDOW_MINUTES = 30;
const FAST_TICK_MS = FAST_WINDOW_MINUTES * 60_000;

/** Toda a grade (via rápida ∪ ciclo normal), da menor para a maior. */
const GRID: readonly number[] = [
  ...FAST_FREQUENCIES,
  ...Array.from({ length: 48 }, (_, i) => (i + 1) * NORMAL_WINDOW_MINUTES),
];

export interface EffectiveFrequency {
  minutes: number;
  raisedBy: null | "robots" | "terms";
}

const ceilToMultiple = (x: number, m: number): number => Math.ceil(x / m) * m;

/**
 * Menor valor da grade ≥ ao maior entre a frequência escolhida (ou o padrão), o teto do
 * `Crawl-delay` (`ceil(2 × crawlDelaySec / 60)`) e `termsMinIntervalMinutes`.
 */
export function effectiveFrequency(
  sourceMinutes: number | null,
  defaultMinutes: number,
  limits?: { crawlDelaySec: number | null; termsMinIntervalMinutes: number | null },
): EffectiveFrequency {
  const raw = sourceMinutes ?? defaultMinutes;
  const robotsMinutes =
    limits?.crawlDelaySec != null ? Math.ceil((2 * limits.crawlDelaySec) / 60) : null;
  const termsMinutes = limits?.termsMinIntervalMinutes ?? null;

  let floor = raw;
  let raisedBy: EffectiveFrequency["raisedBy"] = null;
  if (robotsMinutes != null && robotsMinutes > floor) {
    floor = robotsMinutes;
    raisedBy = "robots";
  }
  if (termsMinutes != null && termsMinutes > floor) {
    floor = termsMinutes;
    raisedBy = "terms";
  }

  const minutes = GRID.find((v) => v >= floor) ?? GRID[GRID.length - 1]!;
  return { minutes, raisedBy: minutes > raw ? raisedBy : null };
}

/** < 30 min é a via rápida (10, 15 ou 20); o resto é ciclo normal. */
export function laneOf(effectiveMinutes: number): "fast" | "normal" {
  return effectiveMinutes < NORMAL_WINDOW_MINUTES ? "fast" : "normal";
}

export interface DueSourceLike {
  lastFetchedAt: string | null;
  /** Frequência já efetiva (ver `effectiveFrequency`). */
  frequencyMinutes: number;
}

/** `floor(fastWindowStart(t) em minutos / F)`: índice do bucket de F minutos na via rápida. */
function fastBucket(t: Date, frequencyMinutes: number): number {
  const minutes = fastWindowStart(t).getTime() / 60_000;
  return Math.floor(minutes / frequencyMinutes);
}

export function isDue(s: DueSourceLike, now: Date): boolean {
  if (s.lastFetchedAt === null) return true;
  const last = new Date(s.lastFetchedAt);
  if (laneOf(s.frequencyMinutes) === "fast") {
    return fastBucket(now, s.frequencyMinutes) > fastBucket(last, s.frequencyMinutes);
  }
  return windowStart(now).getTime() - windowStart(last).getTime() >= s.frequencyMinutes * 60_000;
}

export interface NextCollectionSourceLike {
  status: "active" | "paused" | "degraded" | "blocked";
  lastFetchedAt: string | null;
  frequencyMinutes: number;
}

export function nextCollectionAt(s: NextCollectionSourceLike, now: Date): Date | null {
  if (s.status !== "active" && s.status !== "degraded") return null;
  const fast = laneOf(s.frequencyMinutes) === "fast";

  if (s.lastFetchedAt === null) {
    // Nunca coletada: já está vencida, a próxima oportunidade é o próximo tick agendado.
    return fast
      ? new Date(fastWindowStart(now).getTime() + FAST_TICK_MS)
      : new Date(windowStart(now).getTime() + NORMAL_WINDOW_MINUTES * 60_000);
  }

  const last = new Date(s.lastFetchedAt);
  if (fast) {
    const lastBucket = fastBucket(last, s.frequencyMinutes);
    const targetMinutes = ceilToMultiple(
      (lastBucket + 1) * s.frequencyMinutes,
      FAST_WINDOW_MINUTES,
    );
    return new Date(targetMinutes * 60_000);
  }
  return new Date(windowStart(last).getTime() + s.frequencyMinutes * 60_000);
}

export interface SuggestedFrequency {
  minutes: number;
  basis: "cadence" | "default";
  itemsPerDay: number;
  medianGapMinutes: number | null;
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60_000;
const DEFAULT_SUGGESTED_MINUTES = 30;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

/**
 * Frequência sugerida pela cadência observada (§7.1): últimos 7 dias, `clamp(ceilTo30(mediana do
 * intervalo entre publicações / 2), 30, 1440)`. Nunca sugere a via rápida; menos de 3 datas ⇒
 * `basis: "default"`.
 */
export function suggestFrequency(publishedAts: string[], now: Date): SuggestedFrequency {
  const cutoff = now.getTime() - SEVEN_DAYS_MS;
  const recent = publishedAts
    .map((s) => new Date(s).getTime())
    .filter((t) => Number.isFinite(t) && t >= cutoff && t <= now.getTime())
    .sort((a, b) => a - b);
  const itemsPerDay = recent.length / 7;

  if (recent.length < 3) {
    return {
      minutes: DEFAULT_SUGGESTED_MINUTES,
      basis: "default",
      itemsPerDay,
      medianGapMinutes: null,
    };
  }

  const gapsMinutes: number[] = [];
  for (let i = 1; i < recent.length; i++) {
    gapsMinutes.push((recent[i]! - recent[i - 1]!) / 60_000);
  }
  const medianGapMinutes = median(gapsMinutes);
  const minutes = Math.min(1440, Math.max(30, ceilToMultiple(medianGapMinutes / 2, 30)));
  return { minutes, basis: "cadence", itemsPerDay, medianGapMinutes };
}
