/**
 * Mudanças críticas que exigem duas pessoas (spec §8; plano P5 Task 1). Funções puras: a matriz
 * de papéis por tipo é espelhada no banco (`approval_kind_roles()`, migration 0027) e o teste de
 * integração confere as duas.
 */
import type { Role, RoleGrant } from "@/lib/auth/permissions";

export const CRITICAL_KINDS = [
  "rules.activate",
  "prompt.publish",
  "rec.weights",
  "role.admin",
  "safety.disable",
  "force_review.disable",
  "push.urgent",
] as const;
export type CriticalKind = (typeof CRITICAL_KINDS)[number];

export function isCriticalKind(value: string): value is CriticalKind {
  return (CRITICAL_KINDS as readonly string[]).includes(value);
}

/** Quem pede e quem decide cada tipo. Quem decide ⊂ {admin, editor_chefe} (RLS approvals_decide). */
export const APPROVAL_KIND_ROLES: Record<
  CriticalKind,
  { request: readonly Role[]; decide: readonly Role[] }
> = {
  "rules.activate": {
    request: ["admin", "editor_chefe", "operador_ia"],
    decide: ["admin", "editor_chefe"],
  },
  "safety.disable": {
    request: ["admin", "editor_chefe", "operador_ia"],
    decide: ["admin", "editor_chefe"],
  },
  "force_review.disable": {
    request: ["admin", "editor_chefe", "operador_ia"],
    decide: ["admin", "editor_chefe"],
  },
  "prompt.publish": { request: ["operador_ia"], decide: ["admin", "editor_chefe"] },
  // Pesos: aprova quem aprova pesos em rec_weights (admin, operador_ia) e decide approvals (admin).
  "rec.weights": { request: ["admin", "operador_ia"], decide: ["admin"] },
  "role.admin": { request: ["admin", "editor_chefe"], decide: ["admin", "editor_chefe"] },
  "push.urgent": {
    request: ["admin", "editor_chefe", "editor"],
    decide: ["admin", "editor_chefe"],
  },
};

/**
 * O que a aprovação faz com o alvo (ponto de extensão: `approval_apply` no banco).
 * - `activate`: a versão proposta recebe a assinatura de quem aprova e entra em vigor na mesma
 *   transação (regras e pesos).
 * - `authorize`: a aprovação fica registrada e é consumida pela ação do alvo (conceder admin no
 *   user_roles; publicar prompt em P5-T5; enviar push urgente em P5-T9).
 */
export type ApprovalEffect = "activate" | "authorize";

const EFFECT: Record<CriticalKind, ApprovalEffect> = {
  "rules.activate": "activate",
  "safety.disable": "activate",
  "force_review.disable": "activate",
  "rec.weights": "activate",
  "role.admin": "authorize",
  "prompt.publish": "authorize",
  "push.urgent": "authorize",
};

export function approvalEffect(kind: CriticalKind): ApprovalEffect {
  return EFFECT[kind];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RULE_VERSION = /^[1-9][0-9]{0,9}$/;

/**
 * Formato do alvo por tipo: versão numérica de `rules`; versão em texto de `rec_weights`; uuid
 * da pessoa (role.admin), do prompt (prompt.publish) ou da matéria (push.urgent).
 */
export function targetRefValid(kind: CriticalKind, ref: string): boolean {
  switch (kind) {
    case "rules.activate":
    case "safety.disable":
    case "force_review.disable":
      return RULE_VERSION.test(ref);
    case "rec.weights":
      return ref.trim() !== "" && ref.length <= 100;
    default:
      return UUID.test(ref);
  }
}

export const JUSTIFICATION_MAX = 2000;

/** Justificativa aparada; vazia, só espaços ou longa demais → `null`. */
export function normalizeJustification(text: string): string | null {
  const t = text.trim();
  return t === "" || t.length > JUSTIFICATION_MAX ? null : t;
}

const hasAny = (roles: RoleGrant[], allowed: readonly Role[]) =>
  roles.some((r) => allowed.includes(r.role));

export function canRequestApproval(roles: RoleGrant[], kind: CriticalKind): boolean {
  return hasAny(roles, APPROVAL_KIND_ROLES[kind].request);
}

/** Tem papel para decidir o tipo (quem pediu nunca decide: ver `viewerStance`). */
export function canDecideApproval(roles: RoleGrant[], kind: CriticalKind): boolean {
  return hasAny(roles, APPROVAL_KIND_ROLES[kind].decide);
}

/** Como a pessoa vê um pedido: quem pediu, quem pode decidir ou só acompanha. */
export type ViewerStance = "requester" | "decider" | "observer";

export function viewerStance(
  viewer: { userId: string; roles: RoleGrant[] },
  request: { kind: CriticalKind; requestedBy: string },
): ViewerStance {
  if (viewer.userId === request.requestedBy) return "requester";
  return canDecideApproval(viewer.roles, request.kind) ? "decider" : "observer";
}

/** Vê a tela de aprovações quem pode pedir ou decidir algum tipo. */
export function canSeeApprovals(roles: RoleGrant[]): boolean {
  return CRITICAL_KINDS.some((k) => canRequestApproval(roles, k) || canDecideApproval(roles, k));
}
