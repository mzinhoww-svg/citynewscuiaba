import type { Action } from "@/lib/auth/permissions";
import type { CriticalKind } from "./approvals";

/**
 * Alvos de aprovação (`approvals.target_ref`) e quem pode decidir cada tipo. Puro: a tela e as
 * ações usam para montar o pedido, mostrar o diff e checar o papel (a RLS `approvals_decide` e
 * `approval_apply` conferem de novo no banco).
 */

export type ApprovalTarget =
  | { kind: "rules"; version: number }
  | { kind: "flag"; key: string; value: boolean }
  | { kind: "source"; sourceId: string; field: string; value: string }
  | { kind: "user"; userId: string }
  | { kind: "other"; ref: string };

const RULES = /^rules:(\d+)$/;
const FLAG = /^flag:([a-z_]+)=(true|false)$/;
const SOURCE = /^source:([0-9a-f-]{36}):([a-z_]+)=(.*)$/i;
const USER = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const rulesTarget = (version: number): string => `rules:${version}`;
export const flagTarget = (key: string, value: boolean): string => `flag:${key}=${value}`;
/**
 * Papel de admin (`role.admin`): o alvo é o próprio uuid da pessoa, sem prefixo, porque
 * `consume_role_admin_approval(target)` (0002) compara `target_ref = target::text`.
 */
export const userTarget = (userId: string): string => userId;

export function parseApprovalTarget(ref: string): ApprovalTarget {
  const r = RULES.exec(ref);
  if (r) return { kind: "rules", version: Number(r[1]) };
  const f = FLAG.exec(ref);
  if (f) return { kind: "flag", key: f[1]!, value: f[2] === "true" };
  const s = SOURCE.exec(ref);
  if (s) return { kind: "source", sourceId: s[1]!, field: s[2]!, value: s[3]! };
  if (USER.test(ref)) return { kind: "user", userId: ref };
  return { kind: "other", ref };
}

/** Ação da matriz de permissões que dá a segunda assinatura de cada tipo. */
export const APPROVER_ACTION: Record<CriticalKind, Action> = {
  "rules.activate": "rules.approve",
  "force_review.disable": "rules.approve",
  "safety.disable": "users.manage",
  "prompt.publish": "prompt.publish",
  "rec.weights": "rec.weights",
  "role.admin": "users.manage",
  "push.urgent": "article.publish",
  "push.highlight": "article.publish",
  "push.resume": "article.publish",
  "source.critical": "source.approve_critical",
};

/** Tipos que `approval_apply` (0029) sabe aplicar; os outros têm consumidor próprio. */
export const APPLIED_HERE: ReadonlySet<CriticalKind> = new Set<CriticalKind>([
  "rules.activate",
  "force_review.disable",
  "safety.disable",
]);

/** Onde a pessoa decide o pedido: na caixa de aprovações ou na tela do próprio alvo. */
export function approvalHref(kind: CriticalKind, target: ApprovalTarget): string {
  if (kind === "source.critical" && target.kind === "source")
    return `/estudio/control/fontes/${target.sourceId}`;
  if (kind === "role.admin") return "/estudio/admin/usuarios";
  return "/estudio/control/aprovacoes";
}
