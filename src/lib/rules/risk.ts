import type { Candidate } from "./index";

/**
 * Risco editorial em quatro níveis (D-05, decisão do dono de 04/10/2026). Cada nível sai de um
 * motivo explícito, nunca de uma pontuação opaca, e todos os motivos ficam na decisão:
 *
 * 1 baixo: fontes sustentam o fato, sem divergência material. Publica sozinho.
 * 2 moderado: uma fonte só (sem oficial), divergência em assunto comum, dado preliminar
 *   (urgente). Publica sozinho quando o núcleo factual está sustentado, com as versões atribuídas.
 * 3 alto: divergência sobre fato central em assunto grave, acusação vinda de fonte não confiável
 *   sem segunda fonte, conteúdo que a verificação marcou como duvidoso. Vai para a fila de
 *   revisão (o revisor automático decide com o nível no contexto), sem travar o resto.
 * 4 crítico: sem processamento suficiente para sustentar o texto (rascunho sem IA). Nunca publica
 *   sozinho; reavaliado quando chega fonte nova ou a IA volta.
 *
 * A contagem de linhagens não entra aqui (D-03: indicador informativo).
 */
export type RiskLevel = 1 | 2 | 3 | 4;

export type RiskReason =
  | "no_ai_draft"
  | "dubious"
  | "divergence_grave"
  | "untrusted_grave"
  | "single_source"
  | "divergence"
  | "preliminary";

export interface Risk {
  level: RiskLevel;
  /** Do mais grave para o mais leve. */
  reasons: RiskReason[];
}

const LEVEL: Record<RiskReason, RiskLevel> = {
  no_ai_draft: 4,
  dubious: 3,
  divergence_grave: 3,
  untrusted_grave: 3,
  single_source: 2,
  divergence: 2,
  preliminary: 2,
};

export function classifyRisk(c: Candidate, extra: { aiFallback?: boolean } = {}): Risk {
  const reasons: RiskReason[] = [];
  if (extra.aiFallback) reasons.push("no_ai_draft");
  if (c.dubious) reasons.push("dubious");
  if (c.centralConflict && c.grave) reasons.push("divergence_grave");
  if (c.grave && !c.sourceTrusted && c.independentSources < 2) reasons.push("untrusted_grave");
  if (c.independentSources <= 1 && c.primarySources === 0) reasons.push("single_source");
  if (c.centralConflict && !c.grave) reasons.push("divergence");
  if (c.breaking) reasons.push("preliminary");
  const level = reasons.reduce<RiskLevel>((max, r) => (LEVEL[r] > max ? LEVEL[r] : max), 1);
  return { level, reasons };
}
