import type { Action } from "@/lib/auth";
import type { IconName } from "@/components";

/**
 * Itens do grupo Administração da navegação do Estúdio (A01–A15), na ordem do
 * docs/screens.md §E. Cada tela acrescenta a sua linha aqui; a A09 (Notificações) é do
 * workstream do PWA e entra entre SEO e Auditoria.
 */
export interface AdminNavEntry {
  href: string;
  label: string;
  icon: IconName;
  action: Action;
  exact?: boolean;
}

export const ADMIN_NAV: AdminNavEntry[] = [
  {
    href: "/estudio/admin",
    label: "Administração",
    icon: "sliders-horizontal",
    action: "users.manage",
    exact: true,
  },
  { href: "/estudio/admin/usuarios", label: "Usuários", icon: "users", action: "users.manage" },
  {
    href: "/estudio/admin/papeis",
    label: "Papéis e permissões",
    icon: "lock",
    action: "users.manage",
  },
  { href: "/estudio/admin/equipes", label: "Equipes", icon: "user", action: "users.manage" },
  { href: "/estudio/admin/taxonomia", label: "Taxonomia", icon: "layers", action: "site.manage" },
  { href: "/estudio/admin/home", label: "Home e módulos", icon: "house", action: "site.manage" },
  // A07 Publicidade, A08 SEO (P5-T9)
  // A09 Notificações (PWA, PW-T11..T14)
  // A10 Auditoria, A11 Segurança, A12 Governança, A13 Integrações, A14 Configurações (P5-T9)
  { href: "/estudio/admin/auditoria", label: "Auditoria", icon: "shield", action: "audit.view" },
  {
    href: "/estudio/admin/contingencia",
    label: "Contingência",
    icon: "triangle-alert",
    action: "users.manage",
  },
];
