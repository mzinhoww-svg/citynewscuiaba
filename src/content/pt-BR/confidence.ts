/** Motivos exibidos junto ao nível de confiança (spec §6.3). */
export const CONFIDENCE_REASONS = {
  noIndependent: "Nenhuma fonte independente",
  singleIndependent: "Apenas 1 fonte independente",
  noPrimary: "Sem fonte primária",
  centralConflict: "Fontes divergem em fato central",
  stale: "Atualizada há mais de 24 h",
} as const;
