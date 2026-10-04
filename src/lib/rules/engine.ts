/**
 * Motor de decisão da publicação (A-143; "autonomia primeiro, exceção humana depois"). Recebe o
 * resultado de `decidePublication`/`routeArticle` (regra que decidiu e rota) e o estado do
 * conteúdo, calcula qualidade, confiança e risco (0 a 1), o nível de autonomia (A0 a A4) e uma
 * das saídas: PUBLISH, PUBLISH_DEGRADED, REPROCESS, QUARANTINE, HUMAN_EXCEPTION ou HOLD. Nunca
 * "aguardando aprovação" como padrão.
 *
 * Pessoa só decide o que o sistema não resolve com segurança: fontes divergentes com confiança
 * baixa ou tema sensível, e configuração explícita do dono (categoria em revisão, portões das
 * regras antigas). Falha de IA, fonte curta, confiança baixa, imagem e falta de fonte reprocessam
 * com espera crescente e, esgotados, publicam degradado (risco baixo) ou vão para quarentena com
 * recomendação. O rascunho sem IA (lista de trechos das fontes) nunca publica (regra 4): esgotado,
 * quarentena; a notícia continua no Panorama de fontes como link para o original.
 *
 * Função pura; a política (limites) é versionada e vai para cada decisão.
 */
import { AUTONOMY_TEXT as T } from "@/content/pt-BR/rules";
import {
  AUTONOMY_POLICY_V1,
  type AutonomyLevel,
  type AutonomyOutcome,
  type AutonomyPolicy,
} from "./autonomy-policy";
import type { Candidate, Decision } from "./index";

export interface EngineInput {
  /** Regra que decidiu (`decidePublication` ou travas de `routeArticle`). */
  rule: string;
  route: Decision["route"];
  candidate: Candidate;
  /** O texto é o rascunho sem IA (lista de trechos). */
  aiFallback: boolean;
  /** Reprocessos automáticos já feitos nesta matéria. */
  reprocessCount: number;
  /** Idade da notícia em horas (mais antigo item); `null` quando desconhecida. */
  ageHours: number | null;
  /** Duplicata de matéria existente. */
  duplicate?: boolean;
  /** Justificativa da regra (vai junto do motivo). */
  rationale?: string;
}

export type NextAction = "rewrite" | "reevaluate" | "await_auto_publish" | "breaker_recovery";

export interface EngineDecision {
  outcome: AutonomyOutcome;
  level: AutonomyLevel;
  qualityScore: number;
  confidenceScore: number;
  riskScore: number;
  policyVersion: number;
  reason: string;
  /** Próxima ação do sistema quando REPROCESS. */
  nextAction: NextAction | null;
  /** Espera até o próximo reprocesso, em minutos. */
  nextAttemptInMin: number | null;
  /** Recomendação registrada na quarentena. */
  recommendation: string | null;
}

const clamp = (n: number) => Math.round(Math.min(1, Math.max(0, n)) * 1000) / 1000;

/** Regras cujo problema o tempo e novas fontes podem resolver: reprocessa. */
const REPROCESSABLE = new Set([
  "min_sources",
  "primary",
  "image",
  "min_score",
  "invalid_input",
  "unknown_category",
  "untrusted_grave",
  "rules_unavailable",
]);
/**
 * Configuração explícita do dono: fila de revisão (o revisor automático decide os níveis 2 e 3,
 * D-05). Inclui conteúdo duvidoso e divergência central em assunto grave (risco nível 3, D-05).
 */
const OWNER_REVIEW = new Set([
  "mode",
  "force_review",
  "never_auto",
  "breaking",
  "sensitive",
  "dubious",
  "conflict_grave",
]);

export function riskOf(c: Candidate): number {
  let r = 0.1;
  if (c.grave) r += 0.25;
  if (c.sensitive) r += 0.15;
  if (c.centralConflict) r += 0.25;
  if (c.dubious) r += 0.4;
  if (!c.sourceTrusted && c.independentSources < 2) r += 0.15;
  return clamp(r);
}

export function qualityOf(c: Candidate, aiFallback: boolean): number {
  if (aiFallback) return 0.2;
  let q = 0.55;
  q += (0.1 * Math.min(c.independentSources, 3)) / 3;
  if (c.primarySources > 0) q += 0.1;
  if (c.sourceTrusted) q += 0.1;
  if (c.imageApproved) q += 0.05;
  if (c.dubious) q -= 0.3;
  return clamp(q);
}

function publishLevel(c: Candidate, p: AutonomyPolicy): AutonomyLevel {
  if (c.confidenceScore >= p.highConfidence && c.primarySources > 0 && c.sourceTrusted) return "A0";
  if (c.confidenceScore >= p.highConfidence) return "A1";
  return "A2";
}

export function decideAutonomy(
  i: EngineInput,
  policy: AutonomyPolicy = AUTONOMY_POLICY_V1,
): EngineDecision {
  const c = i.candidate;
  const riskScore = riskOf(c);
  const qualityScore = qualityOf(c, i.aiFallback);
  const confidenceScore = clamp(c.confidenceScore);
  const why = i.rationale ?? "";
  const base = { qualityScore, confidenceScore, riskScore, policyVersion: policy.version };
  const out = (
    outcome: AutonomyOutcome,
    level: AutonomyLevel,
    reason: string,
    extra: Partial<Pick<EngineDecision, "nextAction" | "nextAttemptInMin" | "recommendation">> = {},
  ): EngineDecision => ({
    ...base,
    outcome,
    level,
    reason: reason.trim(),
    nextAction: extra.nextAction ?? null,
    nextAttemptInMin: extra.nextAttemptInMin ?? null,
    recommendation: extra.recommendation ?? null,
  });
  const quarantine = (reason: string, recommendation: string) =>
    out("QUARANTINE", "A4", reason, { recommendation });

  if (i.duplicate) return quarantine(T.duplicate(), "mesclar com a matéria existente");
  if (i.route === "hold") return out("HOLD", "A4", T.ownerHold(why));

  if (i.route === "publish" || i.route === "publish_notify")
    return out("PUBLISH", publishLevel(c, policy), why);

  // Publicação desligada pelo dono: espera o religamento (reconfere periodicamente), sem pessoa.
  if (i.rule === "auto_publish_off")
    return out("REPROCESS", "A3", T.awaitAutoPublish(), {
      nextAction: "await_auto_publish",
      nextAttemptInMin: policy.reprocessDelaysMin[0] ?? 30,
    });

  if (i.rule === "conflict") {
    if (
      !c.sensitive &&
      c.confidenceScore >= policy.conflictPublishConfidence &&
      c.primarySources > 0 &&
      c.sourceTrusted
    )
      return out("PUBLISH", "A2", T.conflictAttributed(why));
    return out("HUMAN_EXCEPTION", "A4", T.conflictHuman());
  }

  if (OWNER_REVIEW.has(i.rule)) return out("HUMAN_EXCEPTION", "A4", T.ownerReview(why));

  const reprocessable = i.aiFallback || i.rule === "ai_unavailable" || REPROCESSABLE.has(i.rule);
  if (!reprocessable) return out("HUMAN_EXCEPTION", "A4", T.exhaustedHuman(why));

  if (i.ageHours !== null && i.ageHours > policy.maxAgeHours)
    return quarantine(T.stale(policy.maxAgeHours), "arquivar: a notícia perdeu a atualidade");

  const total = policy.reprocessDelaysMin.length;
  const delay = policy.reprocessDelaysMin[i.reprocessCount];
  if (delay !== undefined)
    return out(
      "REPROCESS",
      "A3",
      T.reprocess(why || T.degradedWeak(i.rule), i.reprocessCount + 1, total, delay),
      {
        nextAction: i.aiFallback || i.rule === "ai_unavailable" ? "rewrite" : "reevaluate",
        nextAttemptInMin: delay,
      },
    );

  // Reprocessos esgotados. O rascunho sem IA nunca publica (regra 4).
  if (i.aiFallback || i.rule === "ai_unavailable")
    return quarantine(
      T.exhaustedQuarantine(why),
      "reescrever quando a IA voltar; a notícia segue no Panorama como link para o original",
    );
  if (
    riskScore <= policy.maxDegradedRisk &&
    qualityScore >= policy.minDegradedQuality &&
    i.rule !== "invalid_input"
  )
    return out("PUBLISH_DEGRADED", "A3", T.exhaustedDegraded(why));
  return quarantine(
    T.exhaustedQuarantine(why),
    "buscar segunda fonte ou fonte primária e reavaliar",
  );
}
