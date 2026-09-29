import type { StudioNavGroup, StudioNavItem } from "@/components";
import { canReadAiOps } from "@/lib/ai/access";
import { canSeeApprovals } from "@/lib/approvals/kinds";
import { canAccessArea } from "@/lib/admin/access";
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
      {
        href: "/estudio/control/tempo-real",
        label: "Tempo real",
        icon: "clock",
        action: "metrics.view",
      },
      {
        href: "/estudio/control/falhas",
        label: "Filas e falhas",
        icon: "triangle-alert",
        action: "metrics.view",
      },
      {
        href: "/estudio/control/execucoes",
        label: "Execuções",
        icon: "layers",
        action: "metrics.view",
      },
      { href: "/estudio/control/logs", label: "Logs", icon: "search", action: "metrics.view" },
      { href: "/estudio/control/fontes", label: "Fontes", icon: "globe", action: "source.manage" },
      { href: "/estudio/control/regras", label: "Regras", icon: "scale", action: "rules.propose" },
      {
        href: "/estudio/control/recomendacao",
        label: "Recomendação",
        icon: "trending-up",
        action: "metrics.view",
      },
      {
        href: "/estudio/control/agentes",
        label: "Agentes",
        icon: "settings",
        action: "prompt.publish",
      },
      {
        href: "/estudio/control/modelos",
        label: "Modelos",
        icon: "gauge",
        action: "prompt.publish",
      },
      { href: "/estudio/control/testes", label: "Testes", icon: "play", action: "prompt.publish" },
      {
        href: "/estudio/control/aprovacoes",
        label: "Aprovações",
        icon: "file-check",
        visible: canSeeApprovals,
      },
      {
        href: "/estudio/control/conhecimento",
        label: "Conhecimento",
        icon: "layers",
        visible: canReadAiOps,
      },
      {
        href: "/estudio/control/avaliacoes",
        label: "Avaliações",
        icon: "check",
        visible: canReadAiOps,
      },
      {
        href: "/estudio/control/custos",
        label: "Custos",
        icon: "percent",
        visible: canReadAiOps,
      },
      {
        href: "/estudio/control/governanca",
        label: "Governança da IA",
        icon: "shield",
        visible: canReadAiOps,
      },
    ],
  },
  {
    label: "Administração",
    items: [
      {
        href: "/estudio/admin",
        label: "Painel",
        icon: "layout-dashboard",
        action: "users.manage",
        exact: true,
      },
      { href: "/estudio/admin/usuarios", label: "Usuários", icon: "users", action: "users.manage" },
      { href: "/estudio/admin/papeis", label: "Papéis", icon: "shield", action: "users.manage" },
      { href: "/estudio/admin/equipes", label: "Equipes", icon: "users", action: "users.manage" },
      {
        href: "/estudio/admin/taxonomia",
        label: "Taxonomia",
        icon: "layers",
        action: "users.manage",
      },
      { href: "/estudio/admin/home", label: "Home", icon: "newspaper", action: "users.manage" },
    ],
  },
  {
    label: "Governança",
    items: [
      {
        href: "/estudio/admin/auditoria",
        label: "Auditoria",
        icon: "shield",
        action: "audit.view",
      },
      {
        href: "/estudio/admin/publicidade",
        label: "Publicidade",
        icon: "percent",
        visible: (roles) => canAccessArea(roles, "publicidade"),
      },
      {
        href: "/estudio/admin/seo",
        label: "SEO",
        icon: "search",
        visible: (roles) => canAccessArea(roles, "seo"),
      },
      {
        href: "/estudio/admin/notificacoes",
        label: "Notificações",
        icon: "bell",
        visible: (roles) => canAccessArea(roles, "notificacoes"),
      },
      {
        href: "/estudio/admin/seguranca",
        label: "Segurança",
        icon: "lock",
        visible: (roles) => canAccessArea(roles, "seguranca"),
      },
      {
        href: "/estudio/admin/governanca",
        label: "Governança editorial",
        icon: "scale",
        visible: (roles) => canAccessArea(roles, "governanca"),
      },
      {
        href: "/estudio/admin/integracoes",
        label: "Integrações",
        icon: "link",
        visible: (roles) => canAccessArea(roles, "integracoes"),
      },
      {
        href: "/estudio/admin/contingencia",
        label: "Contingência",
        icon: "triangle-alert",
        visible: (roles) => canAccessArea(roles, "contingencia"),
      },
      {
        href: "/estudio/admin/configuracoes",
        label: "Configurações",
        icon: "settings",
        visible: (roles) => canAccessArea(roles, "configuracoes"),
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
