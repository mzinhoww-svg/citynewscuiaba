import {
  FAST_WINDOW_MINUTES,
  WINDOW_MINUTES,
  fastWindowStart,
  windowStart,
} from "@/lib/pipeline/window";
import type { SourceStatus } from "./types";

const MIN = 60_000;
/** Grade de frequências: via rápida (10, 15, 20) e ciclo normal (30 a 1440, de 30 em 30). */
const GRID: readonly number[] = [10, 15, 20, ...Array.from({ length: 48 }, (_, i) => (i + 1) * 30)];

export interface FrequencyLimits {
  crawlDelaySec: number | null;
  termsMinIntervalMinutes: number | null;
}

/**
 * Menor valor da grade >= max(escolhida ou padrão, ceil(2 x Crawl-delay / 60), intervalo dos termos).
 * `raisedBy` diz quem empurrou para cima (só quando a efetiva passou da base).
 */
export function effectiveFrequency(
  sourceMinutes: number | null,
  defaultMinutes: number,
  limits?: FrequencyLimits,
): { minutes: number; raisedBy: null | "robots" | "terms" } {
  const base = sourceMinutes ?? defaultMinutes;
  const robots = limits?.crawlDelaySec ? Math.ceil((2 * limits.crawlDelaySec) / 60) : 0;
  const terms = limits?.termsMinIntervalMinutes ?? 0;
  const target = Math.max(base, robots, terms);
  const minutes = GRID.find((g) => g >= target) ?? 1440;
  if (minutes <= base) return { minutes, raisedBy: null };
  return { minutes, raisedBy: robots >= terms ? "robots" : "terms" };
}

/** Abaixo de 30 min a fonte é da via rápida. */
export function laneOf(effectiveMinutes: number): "fast" | "normal" {
  return effectiveMinutes < WINDOW_MINUTES ? "fast" : "normal";
}

/** Vencimento por janela (D-F17). `frequencyMinutes` é a frequência efetiva. */
export function isDue(
  s: { lastFetchedAt: string | null; frequencyMinutes: number },
  now: Date,
): boolean {
  if (!s.lastFetchedAt) return true;
  const last = new Date(s.lastFetchedAt);
  if (Number.isNaN(last.getTime())) return true;
  if (laneOf(s.frequencyMinutes) === "fast") {
    const size = s.frequencyMinutes * MIN;
    return (
      Math.floor(fastWindowStart(now).getTime() / size) >
      Math.floor(fastWindowStart(last).getTime() / size)
    );
  }
  return (windowStart(now).getTime() - windowStart(last).getTime()) / MIN >= s.frequencyMinutes;
}

/** Próxima coleta prevista: janela de 10 min na via rápida, de 30 min na normal; `null` se não coleta. */
export function nextCollectionAt(
  s: { status: SourceStatus; lastFetchedAt: string | null; frequencyMinutes: number },
  now: Date,
): Date | null {
  if (s.status !== "active" && s.status !== "degraded") return null;
  const fast = laneOf(s.frequencyMinutes) === "fast";
  const size = (fast ? FAST_WINDOW_MINUTES : WINDOW_MINUTES) * MIN;
  const nextWindow = (fast ? fastWindowStart(now) : windowStart(now)).getTime() + size;
  const last = s.lastFetchedAt ? new Date(s.lastFetchedAt) : null;
  if (!last || Number.isNaN(last.getTime())) return new Date(nextWindow);
  let due: number;
  if (fast) {
    const f = s.frequencyMinutes * MIN;
    const point = (Math.floor(fastWindowStart(last).getTime() / f) + 1) * f;
    due = Math.ceil(point / size) * size;
  } else {
    due = windowStart(last).getTime() + s.frequencyMinutes * MIN;
  }
  return new Date(Math.max(due, nextWindow));
}

const DAY = 86_400_000;

/** Sugestão pela cadência dos últimos 7 dias: metade do intervalo mediano, na grade de 30 min. Nunca via rápida. */
export function suggestFrequency(
  publishedAts: string[],
  now: Date,
): {
  minutes: number;
  basis: "cadence" | "default";
  itemsPerDay: number;
  medianGapMinutes: number | null;
} {
  const since = now.getTime() - 7 * DAY;
  const times = publishedAts
    .map((d) => Date.parse(d))
    .filter((t) => Number.isFinite(t) && t >= since && t <= now.getTime())
    .sort((a, b) => a - b);
  const spanDays =
    times.length > 0
      ? Math.min(7, Math.max(1, (now.getTime() - (times[0] ?? now.getTime())) / DAY))
      : 1;
  const itemsPerDay = Math.round((times.length / spanDays) * 10) / 10;
  if (times.length < 3)
    return { minutes: 30, basis: "default", itemsPerDay, medianGapMinutes: null };
  const gaps = times
    .slice(1)
    .map((t, i) => (t - (times[i] ?? t)) / MIN)
    .sort((a, b) => a - b);
  const mid = Math.floor(gaps.length / 2);
  const median = gaps.length % 2 ? (gaps[mid] ?? 0) : ((gaps[mid - 1] ?? 0) + (gaps[mid] ?? 0)) / 2;
  const minutes = Math.min(1440, Math.max(30, Math.ceil(median / 2 / 30) * 30));
  return { minutes, basis: "cadence", itemsPerDay, medianGapMinutes: Math.round(median) };
}
