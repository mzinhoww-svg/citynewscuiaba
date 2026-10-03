import type { ConfidenceLevel } from "@/lib/confidence";
import type { TopicState } from "@/lib/db/queries/types";

/*
 * Textos do portal público (P1), parte "card". `portal.ts` reexporta tudo; os componentes do
 * navegador importam daqui para levar só o que usam (B-018).
 */

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
  agent: (version: string) =>
    `Texto preparado pelo agente ${version}, dentro das regras de autonomia.`,
  versions: "Ver histórico de versões",
  methodology: "Entenda a metodologia",
  methodologyHref: "/metodologia",
} as const;

export const CARD = {
  origin: "Origem",
  summary20s: "Resumo em poucos segundos",
  openIn: (source: string) => `Abrir em ${source}`,
  newTab: "abre em nova aba",
  openOriginal: "Abrir original",
  by: (name: string) => `Por ${name}`,
  photoBy: (name: string) => `Foto: ${name}`,
  viewOriginal: "Ver original",
  topicCounts: (articles: number, sources: number) =>
    `${articles === 1 ? "1 matéria" : `${articles} matérias`} · ${sources === 1 ? "1 fonte" : `${sources} fontes`}`,
  updated: (when: string) => `atualizado ${when}`,
  collectionItems: (n: number) => (n === 1 ? "1 item" : `${n} itens`),
  now: "Agora",
  nextCycle: (min: number) => `Próximo ciclo em ${min} min`,
} as const;
