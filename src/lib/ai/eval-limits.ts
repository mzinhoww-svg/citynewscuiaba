/** Limites de aceite da regressão (spec §9): abaixo disso o PR que mexe na IA falha. */
export const REGRESSION_LIMITS = {
  minPrecision: 0.95,
  /** Cobertura mínima com o caso de controle (2 de 3 esperados) incluído. */
  minCoverage: 0.6,
  maxHallucinationsPer100: 2,
  maxUnsourced: 0,
  /** O caso de controle conta 1 recusa indevida por desenho. */
  maxRefusalsWrong: 1,
} as const;
