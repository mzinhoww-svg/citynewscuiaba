import type { StudioNavGroup, StudioNavItem } from "@/components";
import { canAccess, type Action, type RoleGrant } from "@/lib/auth";
import { PUSH_ACTIONS } from "@/lib/push/permissions";

interface Entry extends StudioNavItem {
  /** Ação exigida para ver o item; ausente = qualquer papel do Estúdio. */
  action?: Action;
  /** Basta uma destas ações (A09: quem só tem `push.metrics` também entra). */
  anyOf?: readonly Action[];
  /** Destino conforme o papel (analista vai direto ao Funil do app, G11). */
  hrefFor?: (roles: RoleGrant[]) => string;
  /** Rótulo conforme o papel e o estado (pendentes de aprovação, G10). */
  labelFor?: (roles: RoleGrant[], opts: StudioNavOptions) => string;
}

export interface StudioNavOptions {
  /** Pedidos de push aguardando aprovação (só faz diferença para quem tem `push.approve`). */
  pendingPush?: number;
}

export const PUSH_ADMIN_PATH = "/estudio/admin/notificacoes";

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
      {
        href: "/estudio/control/tempo-real",
        label: "Tempo real",
        icon: "activity",
        action: "metrics.view",
      },
      {
        href: "/estudio/control/falhas",
        label: "Falhas",
        icon: "circle-alert",
        action: "source.manage",
      },
      {
        href: "/estudio/control/execucoes",
        label: "Execuções",
        icon: "history",
        action: "metrics.view",
      },
      { href: "/estudio/control/logs", label: "Logs", icon: "scroll-text", action: "audit.view" },
      { href: "/estudio/control/fontes", label: "Fontes", icon: "globe", action: "source.manage" },
      { href: "/estudio/control/regras", label: "Regras", icon: "scale", action: "rules.propose" },
      { href: "/estudio/control/custos", label: "Custos", icon: "percent", action: "metrics.view" },
      {
        href: "/estudio/control/conhecimento",
        label: "Bases de conhecimento",
        icon: "database",
        action: "metrics.view",
      },
      {
        href: "/estudio/control/avaliacoes",
        label: "Avaliações",
        icon: "flask-conical",
        action: "metrics.view",
      },
      {
        href: "/estudio/control/governanca",
        label: "Governança da IA",
        icon: "shield",
        action: "metrics.view",
      },
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
      {
        href: PUSH_ADMIN_PATH,
        label: "Notificações",
        icon: "bell",
        anyOf: PUSH_ACTIONS,
        // Só métricas (analista): o item leva direto ao Funil do app.
        hrefFor: (roles) =>
          PUSH_ACTIONS.filter((a) => a !== "push.metrics").some((a) => canAccess(roles, a))
            ? PUSH_ADMIN_PATH
            : `${PUSH_ADMIN_PATH}/funil`,
        labelFor: (roles, { pendingPush }) =>
          pendingPush && pendingPush > 0 && canAccess(roles, "push.approve")
            ? `Notificações (${pendingPush})`
            : "Notificações",
      },
    ],
  },
];

function visible(it: Entry, roles: RoleGrant[]): boolean {
  if (it.anyOf) return it.anyOf.some((a) => canAccess(roles, a));
  return it.action === undefined || canAccess(roles, it.action);
}

/** Navegação lateral do Estúdio filtrada pelo papel (docs/screens.md, shell do Estúdio). */
export function studioNav(roles: RoleGrant[], opts: StudioNavOptions = {}): StudioNavGroup[] {
  return GROUPS.map((group) => ({
    label: group.label,
    items: group.items
      .filter((it) => visible(it, roles))
      .map(({ href, label, icon, exact, hrefFor, labelFor }) => ({
        href: hrefFor ? hrefFor(roles) : href,
        label: labelFor ? labelFor(roles, opts) : label,
        icon,
        exact,
      })),
  })).filter((group) => group.items.length > 0);
}
