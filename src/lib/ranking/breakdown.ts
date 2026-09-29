import { effectiveWeights, WEIGHT_KEYS } from "./score";
import type { SourceSignals, WeightKey, Weights } from "./types";

/** Uma linha de "Por que esta recomendação": componente, peso efetivo e contribuição. */
export interface ScoreComponent {
  key: WeightKey;
  /** Sinal normalizado em [0, 1]. */
  value: number;
  /** Peso em uso (individual = 0 sem Personalização; demais renormalizados). */
  weight: number;
  contribution: number;
}

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

/**
 * Componentes do score composto de uma fonte, com os mesmos pesos efetivos de `scoreSource`
 * (a soma das contribuições é o score). Sem Personalização o componente individual pesa 0 e o
 * valor exibido também é 0: nada individual aparece.
 */
export function scoreBreakdown(
  s: SourceSignals,
  w: Weights,
  personalization: boolean,
): { components: ScoreComponent[]; total: number } {
  const ew = effectiveWeights(w, personalization);
  const components = WEIGHT_KEYS.map((key): ScoreComponent => {
    const value = key === "individual" && !personalization ? 0 : clamp01(s[key]);
    return { key, value, weight: ew[key], contribution: ew[key] * value };
  });
  return { components, total: clamp01(components.reduce((a, c) => a + c.contribution, 0)) };
}
