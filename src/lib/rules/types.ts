export type Mode = "auto" | "auto_notify" | "review" | "blocked";

export interface CategoryRule {
  mode: Mode;
  minSources: number;
  requirePrimary: boolean;
  requireApprovedImage: boolean;
  minScore: number | null;
  summaryWords: number | null;
}

export interface RuleSet {
  version: number;
  forceReview: boolean;
  sensitiveTopics: string[];
  /**
   * Categorias (e a subárvore `<categoria>-*`) que nunca publicam sozinhas. Regras v3 (A2/A4):
   * `[]`. Corpos antigos, sem o campo, valem como `["seguranca"]` (ver `parseRuleRow`).
   */
  neverAuto: string[];
  /** Notícia urgente (breaking) sobe para revisão. Desligado nas regras v3 (A2). */
  breakingReview: boolean;
  /** Item marcado sensível pela classificação sobe para revisão. Desligado nas regras v3 (A2). */
  sensitiveFlagReview: boolean;
  categories: Record<string, CategoryRule>;
}
