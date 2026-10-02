/**
 * Pesos propostos e testes A/B da recomendação (P5-T7, tela O17/O18). Puro: validação da soma
 * dos pesos (Global Constraints: 1,00 ± 0,001), atribuição estável de variante por `anonId`
 * (hash FNV-1a, sem sorteio), rótulo de versão do algoritmo gravado nos eventos e teste de
 * duas proporções para a significância do CTR.
 */
import { WEIGHT_KEYS } from "./score";
import type { Weights } from "./types";

export const WEIGHTS_TOLERANCE = 0.001;

/** Soma dos pesos em 1,00 ± 0,001, nenhum negativo. A soma volta arredondada para a tela. */
export function weightsValid(w: Weights): { ok: boolean; sum: number } {
  const raw = WEIGHT_KEYS.reduce((acc, k) => acc + (Number.isFinite(w[k]) ? w[k] : 0), 0);
  const sum = Math.round(raw * 1000) / 1000;
  const ok =
    WEIGHT_KEYS.every((k) => Number.isFinite(w[k]) && w[k] >= 0) &&
    Math.abs(raw - 1) <= WEIGHTS_TOLERANCE + 1e-12;
  return { ok, sum };
}

/** FNV-1a de 32 bits (estável entre servidor e navegador). */
export function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export interface ExperimentAssignment {
  id: string;
  /** Alocação por variante (pesos relativos, ex.: [50, 50] ou [80, 20]). */
  split: number[];
}

/**
 * Variante de um leitor num experimento: mesma resposta para o mesmo `anonId` e o mesmo
 * experimento (hash, sem estado). Split inválido → variante 0.
 */
export function assignVariant(anonId: string, exp: ExperimentAssignment): number {
  const total = exp.split.reduce((s, x) => s + (Number.isFinite(x) && x > 0 ? x : 0), 0);
  if (total <= 0) return 0;
  const point = (fnv1a(`${exp.id}:${anonId}`) % 10_000) / 10_000;
  let acc = 0;
  for (let i = 0; i < exp.split.length; i++) {
    acc += Math.max(0, exp.split[i] ?? 0) / total;
    if (point < acc) return i;
  }
  return exp.split.length - 1;
}

/** `rec-v1+3f2a9c1e:1` (≤ 20 caracteres, limite de `events.algo_version`). */
export function experimentVersion(base: string, experimentId: string, variant: number): string {
  return `${base}+${experimentId.replace(/-/g, "").slice(0, 8)}:${variant}`;
}

const EXP_VERSION = /^([a-z0-9.-]+)\+([0-9a-f]{8}):(\d+)$/;

export function parseExperimentVersion(
  v: string,
): { base: string; experiment: string; variant: number } | null {
  const m = EXP_VERSION.exec(v);
  return m ? { base: m[1]!, experiment: m[2]!, variant: Number(m[3]) } : null;
}

/** Prefixo de 8 hexadecimais que identifica o experimento nos eventos. */
export const experimentKey = (id: string): string => id.replace(/-/g, "").slice(0, 8);

export interface Proportion {
  n: number;
  k: number;
}

/** Erro complementar (Abramowitz-Stegun 7.1.26), suficiente para o p-valor do painel. */
function erfc(x: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-x * x);
  return x >= 0 ? 1 - y : 1 + y;
}

/** Teste z de duas proporções (bicaudal, α = 0,05) para CTR de variantes. */
export function proportionTest(
  a: Proportion,
  b: Proportion,
): { z: number; pValue: number; significant: boolean } {
  if (a.n <= 0 || b.n <= 0) return { z: 0, pValue: 1, significant: false };
  const p1 = a.k / a.n;
  const p2 = b.k / b.n;
  const pooled = (a.k + b.k) / (a.n + b.n);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / a.n + 1 / b.n));
  if (!(se > 0)) return { z: 0, pValue: 1, significant: false };
  const z = (p1 - p2) / se;
  const pValue = Math.min(1, erfc(Math.abs(z) / Math.SQRT2));
  return { z, pValue, significant: pValue < 0.05 };
}
