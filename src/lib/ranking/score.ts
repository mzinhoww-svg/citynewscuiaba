import type { RecConfig, SourceSignals, WeightKey, Weights } from "./types";

/** Pesos padrão `rec-v1` (spec §7.1). */
export const REC_V1: Weights = Object.freeze({
  popularity: 0.35,
  individual: 0.25,
  recency: 0.15,
  engagement: 0.1,
  operational: 0.1,
  diversity: 0.05,
});

export const WEIGHT_KEYS: readonly WeightKey[] = [
  "popularity",
  "individual",
  "recency",
  "engagement",
  "operational",
  "diversity",
];

/** Padrões da spec, usados quando o banco falha ou o registro ativo é inválido. */
export const DEFAULT_REC_CONFIG: RecConfig = Object.freeze({
  version: "rec-v1",
  weights: REC_V1,
  cap: 0.25,
  discoveryEvery: 5,
});

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

/**
 * Pesos em uso: sem Personalização o individual vai a 0 e os demais são renormalizados para
 * somar 1 (spec §7.1; CLAUDE.md §5 regra 7).
 */
export function effectiveWeights(w: Weights, personalization: boolean): Weights {
  const base: Weights = personalization ? { ...w } : { ...w, individual: 0 };
  const sum = WEIGHT_KEYS.reduce((acc, k) => acc + Math.max(0, base[k]), 0);
  const out = { ...base };
  for (const k of WEIGHT_KEYS) out[k] = sum > 0 ? Math.max(0, base[k]) / sum : 0;
  return out;
}

/** Score composto Σ wᵢ·cᵢ com componentes limitados a [0, 1]. */
export function scoreSource(s: SourceSignals, w: Weights, personalization: boolean): number {
  const ew = effectiveWeights(w, personalization);
  const score = WEIGHT_KEYS.reduce((acc, k) => acc + ew[k] * clamp01(s[k]), 0);
  return clamp01(score);
}
