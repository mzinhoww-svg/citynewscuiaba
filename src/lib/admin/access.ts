import { canAccess, type Role, type RoleGrant } from "@/lib/auth/permissions";

/** Telas de Administração de P5-T9 (docs/screens.md §E, A07 a A14). */
export const ADMIN_AREAS = [
  "publicidade",
  "seo",
  "notificacoes",
  "auditoria",
  "seguranca",
  "governanca",
  "integracoes",
  "configuracoes",
  "contingencia",
] as const;
export type AdminArea = (typeof ADMIN_AREAS)[number];

/** Quem entra em cada tela (auditoria segue a ação `audit.view` da matriz). */
const AREA_ROLES: Record<Exclude<AdminArea, "auditoria">, readonly Role[]> = {
  publicidade: ["admin", "editor_chefe"],
  seo: ["admin", "editor_chefe"],
  // Mesmos papéis que pedem e decidem push urgente (approvals/kinds.ts).
  notificacoes: ["admin", "editor_chefe", "editor"],
  seguranca: ["admin", "editor_chefe"],
  governanca: ["admin", "editor_chefe", "operador_ia"],
  integracoes: ["admin", "operador_ia"],
  configuracoes: ["admin", "editor_chefe"],
  // Botões de emergência: só admin (a RLS de `feature_flags` também exige).
  contingencia: ["admin"],
};

export function canAccessArea(roles: RoleGrant[], area: AdminArea): boolean {
  if (area === "auditoria") return canAccess(roles, "audit.view");
  return roles.some((r) => AREA_ROLES[area].includes(r.role));
}

export const isAdminRole = (roles: RoleGrant[]): boolean => roles.some((r) => r.role === "admin");

/** Escrita em configurações e SEO (RLS de `site_settings`) e em campanhas (`sponsored_manage`). */
export const canWriteSettings = (roles: RoleGrant[]): boolean =>
  roles.some((r) => r.role === "admin" || r.role === "editor_chefe");

/** Liga e desliga o patrocínio (`feature_flags` só admin) e libera bloqueios de login. */
export const canToggleFlags = isAdminRole;
