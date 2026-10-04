/*
 * Estado do assunto (AUT-T7, A10): transições automáticas, visíveis só no Estúdio (admin e
 * editor). Confirmado com 2 veículos independentes ou 1 fonte oficial; corrigido ao publicar uma
 * correção; encerrado depois de 7 dias sem novidade. O público não vê nenhum estado.
 */

export type TopicState = "em_apuracao" | "confirmado" | "corrigido" | "encerrado";
export const TOPIC_STATES: readonly TopicState[] = [
  "em_apuracao",
  "confirmado",
  "corrigido",
  "encerrado",
];

/** Veículos independentes que confirmam o assunto. */
export const CONFIRM_MIN_OUTLETS = 2;
/** Dias sem novidade (item novo ou matéria publicada) até encerrar o assunto. */
export const CLOSE_AFTER_DAYS = 7;

export interface TopicFacts {
  state: TopicState;
  /** Veículos independentes entre os itens do assunto. */
  independentOutlets: number;
  /** Alguma fonte oficial (confiabilidade `primary`) no assunto. */
  hasOfficial: boolean;
  /** Há correção publicada em matéria do assunto. */
  hasCorrection: boolean;
  /** Dias desde o último item ou publicação do assunto. */
  daysSinceLastItem: number;
}

/**
 * Próximo estado. Só avança: `em_apuracao` → `confirmado` → `corrigido`; `encerrado` vence
 * depois de 7 dias sem novidade, e novidade em assunto encerrado o reabre (volta a ser calculado
 * pelos fatos). Um assunto confirmado ou corrigido nunca volta a `em_apuracao` por perder um
 * veículo (itens duplicados, quarentena).
 */
export function nextTopicState(t: TopicFacts): TopicState {
  if (t.daysSinceLastItem >= CLOSE_AFTER_DAYS) return "encerrado";
  const base: TopicState = t.state === "encerrado" ? "em_apuracao" : t.state;
  if (t.hasCorrection || base === "corrigido") return "corrigido";
  if (t.independentOutlets >= CONFIRM_MIN_OUTLETS || t.hasOfficial || base === "confirmado")
    return "confirmado";
  return "em_apuracao";
}
