import type { Action } from "@/lib/auth";
import type { IconName } from "@/components";

/**
 * Áreas da Administração do Estúdio (A01–A15), na ordem do docs/screens.md §E. Cada tela
 * acrescenta a sua linha aqui; a A09 (Notificações) é do workstream do PWA e fica na Redação.
 * O painel da Administração (A01) lista todas como atalhos. No menu lateral, a Contingência
 * (A15) sai do grupo Administração e abre o Control Center, em destaque (item 50).
 */
export interface AdminNavEntry {
  href: string;
  label: string;
  icon: IconName;
  action: Action;
  exact?: boolean;
}

/** A15 · Contingência: primeiro item do Control Center no menu (`nav.ts`). */
export const CONTINGENCY_NAV: AdminNavEntry = {
  href: "/estudio/admin/contingencia",
  label: "Contingência",
  icon: "triangle-alert",
  action: "users.manage",
};

export const ADMIN_NAV: AdminNavEntry[] = [
  {
    href: "/estudio/admin",
    label: "Administração",
    icon: "chart-column",
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
  { href: "/estudio/admin/taxonomia", label: "Taxonomia", icon: "list", action: "site.manage" },
  { href: "/estudio/admin/home", label: "Home e módulos", icon: "house", action: "site.manage" },
  {
    href: "/estudio/admin/destaques",
    label: "Destaques",
    icon: "star",
    action: "featured.manage",
  },
  {
    href: "/estudio/admin/publicidade",
    label: "Publicidade",
    icon: "ticket",
    action: "site.manage",
  },
  { href: "/estudio/admin/seo", label: "SEO", icon: "search", action: "site.manage" },
  { href: "/estudio/admin/auditoria", label: "Auditoria", icon: "eye", action: "audit.view" },
  {
    href: "/estudio/admin/seguranca",
    label: "Segurança e privacidade",
    icon: "eye-off",
    action: "users.manage",
  },
  {
    href: "/estudio/admin/governanca",
    label: "Governança editorial",
    icon: "book-open",
    action: "site.manage",
  },
  {
    href: "/estudio/admin/integracoes",
    label: "Integrações",
    icon: "link",
    action: "users.manage",
  },
  {
    href: "/estudio/admin/configuracoes",
    label: "Configurações",
    icon: "sliders-horizontal",
    action: "users.manage",
  },
  {
    href: "/estudio/admin/interruptores",
    label: "Interruptores",
    icon: "circle-pause",
    action: "users.manage",
  },
  CONTINGENCY_NAV,
];

/** Itens do grupo Administração no menu lateral (sem a Contingência, que vai ao Control Center). */
export const ADMIN_MENU: AdminNavEntry[] = ADMIN_NAV.filter((e) => e !== CONTINGENCY_NAV);
