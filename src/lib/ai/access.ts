import type { RoleGrant } from "@/lib/auth/permissions";

/**
 * Quem vê as telas de IA do Control Center (conhecimento, avaliações, custos e governança).
 * Espelha a RLS de `ai_calls` e `ai_eval_runs` (admin, editor-chefe, operação de IA e análise):
 * quem está fora leria tabelas vazias sem erro, o que enganaria.
 */
const AI_OPS_ROLES = ["admin", "editor_chefe", "operador_ia", "analista"] as const;

export const canReadAiOps = (roles: RoleGrant[]): boolean =>
  roles.some((g) => (AI_OPS_ROLES as readonly string[]).includes(g.role));
