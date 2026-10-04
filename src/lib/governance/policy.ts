/**
 * Motor de política da governança autônoma (A-127, spec 2026-10-04-governanca-autonoma-design.md).
 *
 * PEDIDO → POLÍTICA → VALIDAÇÃO → APLICAÇÃO → AUDITORIA. Cada pedido recebe um resultado:
 * - `auto_apply`: seguro pela política; o sistema aprova (SYSTEM_APPROVAL) e aplica;
 * - `auto_review`: precisa de tratamento automático adicional (nova tentativa, outra checagem);
 * - `human_exception`: o sistema não consegue resolver com segurança (exceção real, com prazo);
 * - `rejected`: inseguro ou inválido; recusado na hora, sem fila.
 * Nunca há "aguardando aprovação" como padrão, nem exigência de segunda pessoa.
 *
 * Função pura: o banco (`governance_apply`, 0148) confere de novo as invariantes (papel, alvo,
 * conteúdo amarrado ao pedido) e registra a decisão em `governance_decisions`.
 */
import type { Role } from "@/lib/auth/permissions";
import { WEIGHT_KEYS } from "@/lib/ranking/score";
import { weightsValid } from "@/lib/ranking/experiments";
import type { Weights } from "@/lib/ranking/types";
import type { RuleSet } from "@/lib/rules";
import { validateRuleSet, weakensSafety } from "@/lib/rules/simulate";

/** Versão da política (a mesma da linha ativa em `governance_policies`, 0148). */
export const GOVERNANCE_POLICY_VERSION = 1;

export type GovernanceOutcome = "auto_apply" | "auto_review" | "human_exception" | "rejected";

export interface GovernanceDecision {
  outcome: GovernanceOutcome;
  ruleId: string;
  policyVersion: number;
  /** 0 a 1: quão segura a política está da decisão. */
  confidence: number;
  reason: string;
  /** Entradas que a decisão considerou (vão para a trilha, com hash). */
  inputs: Record<string, unknown>;
}

export type GovernanceRequest =
  | {
      kind: "rules.activate" | "force_review.disable" | "safety.disable";
      actorRoles: readonly Role[];
      current: RuleSet;
      next: RuleSet;
      /** Resultado da simulação contra os últimos 7 dias, quando houver. */
      simulation?: { changed: number; total: number };
    }
  | {
      kind: "prompt.publish";
      actorRoles: readonly Role[];
      body: string;
      /** Regressão automática (agentes com suíte); ausente quando o agente não tem suíte. */
      regression?: { passed: boolean; metrics: Record<string, number> };
    }
  | {
      kind: "rec.weights";
      actorRoles: readonly Role[];
      current: Weights | null;
      next: Weights;
    };

/** Mudança total (soma das diferenças) acima disto não é "normal": recusa (os pesos em vigor ficam). */
export const REC_MAX_L1_CHANGE = 0.6;
const PROMPT_MAX_CHARS = 30_000;
/** Instruções que desmontam a regra 6 (texto externo é dado): recusa automática. */
const PROMPT_UNSAFE = [
  /ignor[ea]\s+(as\s+|todas\s+as\s+)?instru[cç][oõ]es/i,
  /ignore\s+(all\s+|previous\s+|the\s+)*instructions/i,
  /siga\s+as\s+instru[cç][oõ]es\s+(do|contidas\s+no)\s+texto/i,
];

const decision = (
  outcome: GovernanceOutcome,
  ruleId: string,
  reason: string,
  inputs: Record<string, unknown>,
  confidence = 1,
): GovernanceDecision => ({
  outcome,
  ruleId,
  policyVersion: GOVERNANCE_POLICY_VERSION,
  confidence: Math.round(Math.min(1, Math.max(0, confidence)) * 1000) / 1000,
  reason,
  inputs,
});

function rulesPolicy(
  r: Extract<GovernanceRequest, { kind: `${string}.${string}`; next: RuleSet }>,
) {
  const valid = validateRuleSet(r.next);
  const inputs = {
    version: r.next.version,
    simulation: r.simulation ?? null,
    weakensSafety: weakensSafety(r.current, r.next),
  };
  if (!valid.ok) return decision("rejected", "rules.invalid", valid.error, inputs);
  // Afrouxar a segurança das regras é ação explícita do dono (admin); não é segunda pessoa.
  if (inputs.weakensSafety && !r.actorRoles.includes("admin"))
    return decision(
      "human_exception",
      "rules.safety_owner_action",
      "A proposta afrouxa a segurança das regras: aplicar é ação do admin.",
      inputs,
    );
  const share =
    r.simulation && r.simulation.total > 0 ? r.simulation.changed / r.simulation.total : 0;
  return decision(
    "auto_apply",
    "rules.valid",
    "Regras válidas e quem pede tem o papel; aplicadas pelo sistema.",
    inputs,
    1 - share * 0.5,
  );
}

function promptPolicy(r: Extract<GovernanceRequest, { kind: "prompt.publish" }>) {
  const body = r.body.trim();
  const inputs = { chars: body.length, regression: r.regression ?? null };
  if (body.length === 0 || body.length > PROMPT_MAX_CHARS)
    return decision("rejected", "prompt.size", "Prompt vazio ou longo demais.", inputs);
  if (PROMPT_UNSAFE.some((re) => re.test(body)))
    return decision(
      "rejected",
      "prompt.unsafe",
      "O prompt manda seguir ou ignorar instruções do texto externo (regra 6).",
      inputs,
    );
  if (r.regression && !r.regression.passed)
    return decision(
      "rejected",
      "prompt.regression_failed",
      "A regressão automática reprovou a versão; a versão em produção continua.",
      inputs,
    );
  return decision(
    "auto_apply",
    r.regression ? "prompt.regression_passed" : "prompt.safety_checks",
    r.regression
      ? "Passou na regressão e nas checagens de segurança; ativado pelo sistema."
      : "Passou nas checagens de segurança; ativado pelo sistema (agente sem suíte de regressão).",
    inputs,
    r.regression ? 1 : 0.9,
  );
}

function weightsPolicy(r: Extract<GovernanceRequest, { kind: "rec.weights" }>) {
  const valid = weightsValid(r.next);
  const l1 = r.current
    ? WEIGHT_KEYS.reduce((acc, k) => acc + Math.abs(r.next[k] - r.current![k]), 0)
    : 0;
  const inputs = { sum: valid.sum, l1: Math.round(l1 * 1000) / 1000 };
  if (!valid.ok)
    return decision("rejected", "rec.invalid_sum", "Os pesos precisam somar 1,00.", inputs);
  if (l1 > REC_MAX_L1_CHANGE)
    return decision(
      "rejected",
      "rec.abrupt_change",
      "Mudança brusca demais nos pesos; os pesos em vigor continuam.",
      inputs,
    );
  return decision(
    "auto_apply",
    "rec.valid",
    "Pesos válidos e mudança dentro da faixa; ativados pelo sistema.",
    inputs,
    1 - l1 / 2,
  );
}

export function evaluateGovernance(r: GovernanceRequest): GovernanceDecision {
  switch (r.kind) {
    case "prompt.publish":
      return promptPolicy(r);
    case "rec.weights":
      return weightsPolicy(r);
    default:
      return rulesPolicy(r);
  }
}

// ---------------------------------------------------------------------------
// Fontes: ativação automática e modo de uso
// ---------------------------------------------------------------------------
export type TermsStatus = "unknown" | "acknowledged" | "restricted";
export type SourceUsage = "FULL" | "ATTRIBUTED" | "EXCERPT" | "BLOCKED";

/** Mesmo critério de `source_usage_mode` (0148). */
export function sourceUsage(i: {
  termsStatus: TermsStatus;
  blocked?: boolean;
  republishPolicy?: string;
  imagePolicy?: string;
}): SourceUsage {
  if (i.termsStatus === "restricted" || i.blocked) return "BLOCKED";
  if (i.termsStatus === "unknown") return "EXCERPT";
  if (
    i.republishPolicy === "summary_2_sentences" &&
    (i.imagePolicy === "with_agreement" || i.imagePolicy === "reproduction")
  )
    return "FULL";
  return "ATTRIBUTED";
}

export interface ActivationEvidence {
  reachable: boolean;
  robotsAllowed: boolean;
  extractableItems: number;
  validDates: boolean;
  validLinks: boolean;
  termsStatus: TermsStatus;
  withinCrawlLimits: boolean;
}

/**
 * Ativar fonte depende do que o sistema verifica, não de aprovação genérica. Falha temporária
 * (fora do ar, poucos itens) volta para nova checagem (`auto_review`); robots.txt ou termos
 * restritivos recusam. `human_exception` só quando falta informação que o sistema não infere.
 */
export function decideSourceActivation(
  e: ActivationEvidence,
): GovernanceDecision & { usage: SourceUsage } {
  const usage = sourceUsage({ termsStatus: e.termsStatus });
  const inputs = { ...e };
  const out = (d: GovernanceDecision) => ({ ...d, usage });
  if (!e.robotsAllowed)
    return out(decision("rejected", "source.robots", "robots.txt não permite a coleta.", inputs));
  if (usage === "BLOCKED")
    return out(
      decision("rejected", "source.terms_restricted", "Termos de uso restritivos.", inputs),
    );
  if (
    !e.reachable ||
    e.extractableItems < 3 ||
    !e.validDates ||
    !e.validLinks ||
    !e.withinCrawlLimits
  )
    return out(
      decision(
        "auto_review",
        "source.retry_check",
        "Fonte ainda não passou nas checagens (alcance, itens, datas, links ou limites); nova checagem automática.",
        inputs,
        0.5,
      ),
    );
  return out(
    decision(
      "auto_apply",
      "source.activation_ok",
      "Fonte verificada; ativada pelo sistema.",
      inputs,
    ),
  );
}

/** Estados de pedido: só `pending` não é terminal (e sempre tem prazo, 0148). */
export function isTerminal(status: "pending" | "approved" | "rejected" | "applied" | "expired") {
  return status !== "pending";
}
