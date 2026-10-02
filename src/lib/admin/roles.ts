/**
 * Papéis de uma pessoa (A02/A03): diferença entre o que ela tem e o que a tela pediu.
 * Conceder `admin` nunca é aplicado direto: vira um pedido `role.admin` para outra pessoa
 * decidir (spec §8; `guard_user_roles`, 0002). Puro.
 */
import { ROLES, type Role, type RoleGrant } from "@/lib/auth/permissions";

export interface RolePlan {
  grant: RoleGrant[];
  revoke: Role[];
  /** Mudança só de editorias num papel que já existe. */
  update: RoleGrant[];
  /** `admin` pedido e ainda não concedido: precisa de aprovação. */
  adminRequested: boolean;
}

const norm = (s: readonly string[]) => [...new Set(s)].sort();
const same = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && norm(a).every((v, i) => v === norm(b)[i]);

export const isRole = (v: string): v is Role => (ROLES as readonly string[]).includes(v);

export function planRoleChange(
  current: readonly RoleGrant[],
  wanted: readonly RoleGrant[],
): RolePlan {
  const has = new Map(current.map((r) => [r.role, r]));
  const want = new Map(wanted.map((r) => [r.role, { role: r.role, sections: norm(r.sections) }]));
  const grant: RoleGrant[] = [];
  const update: RoleGrant[] = [];
  let adminRequested = false;
  for (const w of want.values()) {
    const c = has.get(w.role);
    if (!c) {
      if (w.role === "admin") adminRequested = true;
      else grant.push(w);
    } else if (!same(c.sections, w.sections)) update.push(w);
  }
  const revoke = [...has.keys()].filter((r) => !want.has(r));
  return { grant, revoke, update, adminRequested };
}

/** Só `editor` e `metrics.view` por editoria usam `sections`; os outros ficam sem recorte. */
export const SECTION_SCOPED_ROLES: readonly Role[] = ["editor"];
