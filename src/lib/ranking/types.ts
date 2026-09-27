import type { REASON_TEXT } from "@/content/pt-BR/recommendations";

/** Pesos do score composto (spec §7.1). Somam 1. */
export type Weights = {
  popularity: number;
  individual: number;
  recency: number;
  engagement: number;
  operational: number;
  diversity: number;
};

export type WeightKey = keyof Weights;

/** Listas da área Fontes (spec §7.5). */
export type RankList =
  "popular" | "trending" | "recommended" | "followed" | "local" | "verified" | "new";

/** Chave de cada justificativa fixa (spec §7.4, `REASON_TEXT`). */
export type ReasonKey = keyof typeof REASON_TEXT;

/**
 * Sinais de uma fonte, já normalizados em [0, 1] por percentil dentro da janela (T5).
 * `individual` e as afinidades (`recentVisit`, `matchesSearch`, `matchesTopic`, `similar`) só
 * existem com Personalização; sem ela valem 0/false e nunca entram no score nem na justificativa.
 */
export interface SourceSignals {
  slug: string;
  locality: string;
  popularity: number;
  individual: number;
  recency: number;
  engagement: number;
  operational: number;
  diversity: number;
  /** Crescimento da popularidade na semana (percentil), usado em "Em alta nesta semana". */
  trend: number;
  followed: boolean;
  /** `rec_pinned`: fixada pelo admin no topo da lista (conta no teto). */
  pinned: boolean;
  /** `rec_excluded`: nunca aparece em recomendação. */
  excluded: boolean;
  /** Fonte com status `blocked`. */
  blocked: boolean;
  isNewForUser: boolean;
  /** `rec_local_highlight`: destaque em "Fontes locais". */
  localHighlight: boolean;
  /** Confiabilidade `verified` ou `primary` ("Fontes verificadas"). */
  verified: boolean;
  /** O leitor abriu matéria da fonte há pouco (perfil anônimo, com Personalização). */
  recentVisit?: boolean;
  /** A fonte cobre um tema que o leitor pesquisou (com Personalização). */
  matchesSearch?: boolean;
  /** A fonte cobre uma editoria que o leitor acompanha (com Personalização). */
  matchesTopic?: boolean;
  /** A fonte cobre as mesmas editorias das que o leitor lê, sem ele a ler ainda (com Personalização). */
  similar?: boolean;
}

export type RankedSource = SourceSignals & {
  score: number;
  reason: ReasonKey;
  /** Vaga da cota de descoberta (1 a cada 5 em "Recomendadas"). */
  discovery: boolean;
};

export interface RankOptions {
  list: RankList;
  limit: number;
  /** Teto por fonte (padrão 0,25). */
  cap?: number;
  /** Cota de descoberta: 1 a cada N (padrão 5). */
  discoveryEvery?: number;
  /** Fontes ocultadas pelo leitor. */
  hidden: string[];
  weights: Weights;
  personalization: boolean;
}

/** Configuração ativa (`rec_weights`). */
export interface RecConfig {
  version: string;
  weights: Weights;
  cap: number;
  discoveryEvery: number;
}
