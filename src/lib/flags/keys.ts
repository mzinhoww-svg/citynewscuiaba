/**
 * Chaves de `feature_flags` (lista fechada, espelhada no check da migration 0037) e o que cada
 * uma faz quando a leitura falha. Funções puras: a leitura e a escrita ficam em `./index.ts`.
 */
export const FLAG_KEYS = [
  "auto_publish",
  "read_only",
  "ai_enabled",
  "image_reproduction_enabled",
  "personalization_enabled",
  "source_link_analysis",
  "sponsored_enabled",
] as const;
export type FlagKey = (typeof FLAG_KEYS)[number];

export const isFlagKey = (k: string): k is FlagKey => (FLAG_KEYS as readonly string[]).includes(k);

/** As três chaves dos botões de contingência (docs/screens.md A15). */
export const CONTINGENCY_KEYS = ["auto_publish", "read_only", "ai_enabled"] as const;
export type ContingencyKey = (typeof CONTINGENCY_KEYS)[number];

/**
 * Valor assumido quando a flag não pode ser lida (falha fechada). Nada publica sozinho, nenhuma
 * IA nem imagem de terceiros roda, nenhum patrocinado aparece, nenhuma personalização acontece
 * e o Estúdio não grava (o banco que não responde já não gravaria).
 */
export const FAIL_CLOSED: Record<FlagKey, boolean> = {
  auto_publish: false,
  read_only: true,
  ai_enabled: false,
  image_reproduction_enabled: false,
  personalization_enabled: false,
  source_link_analysis: false,
  sponsored_enabled: false,
};

/**
 * Chaves que pertencem às salvaguardas de segurança (regras `never_auto`, `force_review`,
 * temas sensíveis). Não são flags: mudam pela versão de regras, com `safety.disable` /
 * `force_review.disable`. `setFlag` recusa qualquer tentativa de passar por aqui.
 */
export const isSafetySafeguardKey = (k: string): boolean =>
  /^(safety|never_auto|force_review|sensitive)/.test(k);

/** Sentido "seguro" de cada botão de contingência: o valor que protege o portal. */
export const SAFE_VALUE: Record<ContingencyKey, boolean> = {
  auto_publish: false,
  read_only: true,
  ai_enabled: false,
};
