import type { ConfidenceLevel } from "@/lib/confidence";
import type { TopicState } from "@/lib/db/queries/types";

/** Textos do portal público (P1). */

/** Assinatura de matéria escrita por agente, sem autor humano. */
export const BYLINE = {
  newsroom: "Redação CityNews",
} as const;

export const CONFIDENCE_TEXT: Record<ConfidenceLevel, string> = {
  alta: "Confiança alta",
  média: "Confiança média",
  baixa: "Confiança baixa",
};

export const TOPIC_STATE_TEXT: Record<TopicState, string> = {
  em_apuracao: "Em apuração",
  confirmado: "Confirmado",
  corrigido: "Corrigido",
  encerrado: "Encerrado",
};

export const MADE_HOW = {
  title: "Como esta matéria foi feita",
  reviewedBy: (name: string) => `Revisado por ${name}.`,
  agent: (version: string) =>
    `Texto preparado pelo agente ${version}, dentro das regras de autonomia.`,
  versions: "Ver histórico de versões",
  methodology: "Entenda a metodologia",
  methodologyHref: "/metodologia",
} as const;
