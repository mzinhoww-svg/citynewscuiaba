/**
 * Política de autonomia da publicação ("autonomia primeiro, exceção humana depois"; decisão do
 * dono, 04/10/2026). Os limites ficam num objeto versionado: a versão vai para cada decisão
 * (`decisions.output.policy_version`) e as regras podem trazer um bloco `autonomy` próprio, que
 * substitui estes valores campo a campo (`parseRuleRow`).
 */

/**
 * A0 determinístico (fonte primária confiável, confiança alta) · A1 IA com confiança alta ·
 * A2 IA corroborada (regras satisfeitas) · A3 degradado, mas aceitável · A4 sem solução.
 */
export type AutonomyLevel = "A0" | "A1" | "A2" | "A3" | "A4";

/**
 * Saída do motor. Nunca existe "aguardando aprovação": só `HUMAN_EXCEPTION` vai para pessoa.
 * `HOLD` é a categoria bloqueada pelo dono nas regras (fica em rascunho até as regras mudarem).
 */
export type AutonomyOutcome =
  "PUBLISH" | "PUBLISH_DEGRADED" | "REPROCESS" | "QUARANTINE" | "HUMAN_EXCEPTION" | "HOLD";

export type LevelOutcome = Exclude<AutonomyOutcome, "HOLD">;

export interface AutonomyPolicy {
  version: number;
  /** Confiança a partir da qual a matéria é A1 (ou A0 com fonte primária confiável). */
  highConfidence: number;
  /** Abaixo disto, fonte divergente vira exceção humana. */
  lowConfidence: number;
  /** Fontes divergentes publicam com atribuição se a confiança passa disto e há primária confiável. */
  conflictPublishConfidence: number;
  /** Fontes independentes que tornam a matéria "corroborada" (bônus de confiança). */
  corroboratedSources: number;
  /** Qualidade mínima (0..1) para publicar degradado (rascunho sem IA ou reprocesso esgotado). */
  minDegradedQuality: number;
  /** Risco máximo (0..1) para publicar degradado; acima, quarentena. */
  maxDegradedRisk: number;
  /** Espera antes de cada novo reprocesso, em minutos (30 min, 2 h, 6 h). */
  reprocessDelaysMin: number[];
  /** Matéria mais velha que isto (horas) não publica: quarentena. */
  maxAgeHours: number;
  /** Saída padrão de cada nível. */
  outcomeByLevel: Record<AutonomyLevel, LevelOutcome>;
}

export const AUTONOMY_POLICY_V1: AutonomyPolicy = {
  version: 1,
  highConfidence: 0.7,
  lowConfidence: 0.5,
  conflictPublishConfidence: 0.8,
  corroboratedSources: 2,
  minDegradedQuality: 0.5,
  maxDegradedRisk: 0.5,
  reprocessDelaysMin: [30, 120, 360],
  maxAgeHours: 72,
  outcomeByLevel: {
    A0: "PUBLISH",
    A1: "PUBLISH",
    A2: "PUBLISH",
    A3: "PUBLISH_DEGRADED",
    A4: "HUMAN_EXCEPTION",
  },
};
