import type { StudioNavGroup, StudioNavItem } from "@/components";
import { canSeeApprovals } from "@/lib/approvals/kinds";
import { canAccess, type Action, type RoleGrant } from "@/lib/auth";

interface Entry extends StudioNavItem {
  /** Ação exigida para ver o item; ausente = qualquer papel do Estúdio. */
  action?: Action;
  /** Regra própria de visibilidade (quando nenhuma ação da matriz descreve o acesso). */
  visible?: (roles: RoleGrant[]) => boolean;
}

const GROUPS: { label: string; items: Entry[] }[] = [
  {
    label: "Redação",
    items: [
      { href: "/estudio", label: "Newsroom", icon: "layout-dashboard", exact: true },
      {
        href: "/estudio/fila",
        label: "Fila de matérias",
        icon: "newspaper",
        action: "article.edit",
      },
      {
        href: "/estudio/calendario",
        label: "Calendário",
        icon: "calendar-days",
        action: "article.edit",
      },
      {
        href: "/estudio/correcoes",
        label: "Correções",
        icon: "check",
        action: "correction.manage",
      },
      { href: "/estudio/midia", label: "Mídia", icon: "camera", action: "media.approve" },
      {
        href: "/estudio/agenda/sugestoes",
        label: "Sugestões de evento",
        icon: "calendar",
        action: "article.publish",
      },
      { href: "/estudio/denuncias", label: "Denúncias", icon: "flag", action: "reports.moderate" },
    ],
  },
  {
    label: "Control Center",
    items: [
      {
        href: "/estudio/control",
        label: "Visão geral",
        icon: "gauge",
        action: "metrics.view",
        exact: true,
      },
      { href: "/estudio/control/fontes", label: "Fontes", icon: "globe", action: "source.manage" },
      { href: "/estudio/control/regras", label: "Regras", icon: "scale", action: "rules.propose" },
      {
        href: "/estudio/control/aprovacoes",
        label: "Aprovações",
        icon: "file-check",
        visible: canSeeApprovals,
      },
      { href: "/estudio/control/custos", label: "Custos", icon: "percent", action: "metrics.view" },
    ],
  },
  {
    label: "Governança",
    items: [
      { href: "/estudio/admin/usuarios", label: "Usuários", icon: "users", action: "users.manage" },
      {
        href: "/estudio/admin/auditoria",
        label: "Auditoria",
        icon: "shield",
        action: "audit.view",
      },
    ],
  },
];

/** Navegação lateral do Estúdio filtrada pelo papel (docs/screens.md, shell do Estúdio). */
export function studioNav(roles: RoleGrant[]): StudioNavGroup[] {
  return GROUPS.map((group) => ({
    label: group.label,
    items: group.items
      .filter((it) => it.action === undefined || canAccess(roles, it.action))
      .filter((it) => it.visible === undefined || it.visible(roles))
      .map(({ href, label, icon, exact }) => ({ href, label, icon, exact })),
  })).filter((group) => group.items.length > 0);
}
