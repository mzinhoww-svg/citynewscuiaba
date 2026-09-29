import { WEIGHT_KEYS } from "./score";
import type { Weights } from "./types";

/** Métricas do painel de recomendação (tracking-plan §6). Funções puras. */

/** Top-3 acima disso acende o alerta de concentração (plano P5 Task 7). */
export const CONCENTRATION_ALERT = 0.5;
const EPS = 0.001;

const finite = (n: number) => (Number.isFinite(n) && n > 0 ? n : 0);

/** Contagens → fatias que somam 1 (todas 0 quando não há nada). Negativos contam como 0. */
export function sharesOf(counts: readonly number[]): number[] {
  const clean = counts.map(finite);
  const total = clean.reduce((a, n) => a + n, 0);
  return clean.map((n) => (total > 0 ? n / total : 0));
}

/** Índice de diversidade 1 − Σ share² (0 = uma fonte só). Sem fatias = 0. */
export function diversityIndex(shares: readonly number[]): number {
  if (shares.length === 0) return 0;
  return 1 - shares.reduce((a, s) => a + finite(s) ** 2, 0);
}

/** Soma das três maiores fatias. */
export function concentrationTop3(shares: readonly number[]): number {
  return [...shares]
    .map(finite)
    .sort((a, b) => b - a)
    .slice(0, 3)
    .reduce((a, s) => a + s, 0);
}

export function concentrationAlert(shares: readonly number[]): boolean {
  return concentrationTop3(shares) > CONCENTRATION_ALERT + 1e-9;
}

/** Pesos válidos: cada um em [0, 1] e soma 1 ±0,001. `sum` arredondada a 4 casas. */
export function weightsValid(w: Weights): { ok: boolean; sum: number } {
  const values = WEIGHT_KEYS.map((k) => w[k]);
  const sum = Math.round(values.reduce((a, v) => a + v, 0) * 10_000) / 10_000;
  const each = values.every((v) => Number.isFinite(v) && v >= 0 && v <= 1);
  return { ok: each && Math.abs(sum - 1) <= EPS + 1e-9, sum };
}

export interface Proportion {
  /** Tamanho da amostra (ex.: impressões). */
  n: number;
  /** Sucessos (ex.: cliques). */
  x: number;
}

/** Teste z de duas proporções (bilateral, 95%). Sem amostra nos dois lados: nunca significativo. */
export function proportionTest(a: Proportion, b: Proportion): { z: number; significant: boolean } {
  if (a.n <= 0 || b.n <= 0) return { z: 0, significant: false };
  const p1 = a.x / a.n;
  const p2 = b.x / b.n;
  const pooled = (a.x + b.x) / (a.n + b.n);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / a.n + 1 / b.n));
  if (se === 0) return { z: 0, significant: false };
  const z = (p2 - p1) / se;
  return { z, significant: Math.abs(z) >= 1.96 };
}
