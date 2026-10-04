import "server-only";
import type { DbClient } from "@/lib/db/client";
import type { GovernanceDecision } from "./policy";

const DECISION: Record<GovernanceDecision["outcome"], string> = {
  auto_apply: "auto_approved",
  auto_review: "auto_review",
  human_exception: "human_exception",
  rejected: "rejected",
};

/**
 * Registra a decisão do motor de política em `governance_decisions` (actor = system, política,
 * versão, regra, entradas com hash, confiança e motivo; 0157) e marca o pedido, quando há. Falha
 * de registro não desfaz a mudança: vai para o log do servidor e a auditoria do Estúdio continua.
 */
export async function logGovernance(
  db: DbClient,
  kind: string,
  subjectRef: string,
  decision: GovernanceDecision,
  approvalId: string | null = null,
): Promise<void> {
  const { error } = await db.rpc("governance_log", {
    p_kind: kind,
    p_subject: subjectRef,
    p_decision: DECISION[decision.outcome],
    p_rule: decision.ruleId,
    p_reason: decision.reason,
    p_inputs: JSON.parse(JSON.stringify(decision.inputs)),
    p_confidence: decision.confidence,
    ...(approvalId ? { p_approval: approvalId } : {}),
  });
  if (error) console.error("governança: registro da decisão falhou", kind, subjectRef, error);
}
