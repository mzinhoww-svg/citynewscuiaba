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
  // A09 Notificações (PWA, PW-T11..T14): { href: "/estudio/admin/notificacoes", … }
  { href: "/estudio/admin/auditoria", label: "Auditoria", icon: "shield", action: "audit.view" },
  {
    href: "/estudio/admin/seguranca",
    label: "Segurança e privacidade",
    icon: "lock",
    action: "users.manage",
  },
  {
    href: "/estudio/admin/governanca",
    label: "Governança editorial",
    icon: "scale",
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
    icon: "settings",
    action: "users.manage",
  },
  {
    href: "/estudio/admin/interruptores",
    label: "Interruptores",
    icon: "sliders-horizontal",
    action: "users.manage",
  },
  {
    href: "/estudio/admin/contingencia",
    label: "Contingência",
    icon: "triangle-alert",
    action: "users.manage",
  },
];
