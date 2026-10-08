import type { StudioNavGroup, StudioNavItem } from "@/components/estudio";
import { STUDIO_NAV_TEXT } from "@/content/pt-BR/studio";
import { can, canAccess, type Action, type RoleGrant } from "@/lib/auth";
import type { StudioCounts } from "@/lib/db/queries/studio-counts";
import { GUIDE_SECTION } from "@/lib/studio/guide-scope";
import { PUSH_ACTIONS } from "@/lib/push/permissions";
import { ADMIN_MENU, CONTINGENCY_NAV } from "./admin/nav";

const G = STUDIO_NAV_TEXT.groups;
const SUB = STUDIO_NAV_TEXT.subgroups;

interface Entry extends Omit<StudioNavItem, "count"> {
  /** Ação exigida para ver o item; ausente = qualquer papel do Estúdio. */
  action?: Action;
  /** Basta uma destas ações (A09: quem só tem `push.metrics` também entra). */
  anyOf?: readonly Action[];
  /** Regra própria de visibilidade (Guia: `site.manage` ou `article.edit` na editoria do Guia). */
  visibleFor?: (roles: RoleGrant[]) => boolean;
  /** Destino conforme o papel (analista vai direto ao Funil do app, G11). */
  hrefFor?: (roles: RoleGrant[]) => string;
  /** Rótulo conforme o papel e o estado (pendentes de aprovação, G10). */
  labelFor?: (roles: RoleGrant[], opts: StudioNavOptions) => string;
  /** Contagem do item (item 51), vinda de `studioCounts`. */
  countKey?: keyof StudioCounts;
}

export interface StudioNavOptions {
  /** Pedidos de push aguardando aprovação (só faz diferença para quem tem `push.approve`). */
  pendingPush?: number;
  /** Pendências do menu (item 51): exceções, denúncias vencidas, aprovações, falhas, mídia. */
  counts?: StudioCounts;
}

export const PUSH_ADMIN_PATH = "/estudio/admin/notificacoes";

/** Destino de "Notificações push" conforme o papel (analista vai direto ao Funil do app, G11). */
export function pushHrefFor(roles: RoleGrant[]): string {
  return PUSH_ACTIONS.filter((a) => a !== "push.metrics").some((a) => canAccess(roles, a))
    ? PUSH_ADMIN_PATH
    : `${PUSH_ADMIN_PATH}/funil`;
}

/*
 * Ícones únicos no menu inteiro (item 50; `nav.test.ts` confere). Ao acrescentar um item, escolha
 * um ícone que ainda não está em uso aqui nem em `admin/nav.ts`.
 */
const GROUPS: { label: string; items: Entry[] }[] = [
  {
    label: G.newsroom,
    items: [
      { href: "/estudio", label: "Redação", icon: "layout-dashboard", exact: true },
      {
        href: "/estudio/fila",
        label: "Fila de matérias",
        icon: "newspaper",
        action: "article.edit",
        countKey: "exceptions",
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
        icon: "pencil",
        action: "correction.manage",
      },
      {
        href: "/estudio/midia",
        label: "Mídia",
        icon: "camera",
        action: "media.approve",
        countKey: "mediaPending",
      },
      {
        href: "/estudio/admin/guia",
        label: "Guia Cuiabá",
        icon: "map-pin",
        visibleFor: (roles) =>
          can(roles, "site.manage") || can(roles, "article.edit", { section: GUIDE_SECTION }),
      },
      // Agenda (AGM-T7): eventos e, numa aba, as sugestões de leitores. Só quem publica na
      // editoria Agenda (editor-chefe; editor com a editoria), como a RLS de `event_listings`.
      {
        href: "/estudio/agenda",
        label: "Agenda",
        icon: "calendar",
        visibleFor: (roles) => can(roles, "article.publish", { section: "agenda" }),
      },
      {
        href: "/estudio/denuncias",
        label: "Denúncias",
        icon: "flag",
        action: "reports.moderate",
        countKey: "reportsOverdue",
        countKind: "overdue",
      },
      {
        href: "/estudio/notificacoes",
        label: "Notificações da equipe",
        icon: "message-circle",
      },
      // A09 (PW-T11..T14): item de primeiro nível para quem tem alguma ação de push, com a
      // contagem de pedidos aguardando aprovação para quem aprova.
      {
        href: PUSH_ADMIN_PATH,
        label: "Notificações push",
        icon: "bell",
        anyOf: PUSH_ACTIONS,
        // Só métricas (analista): o item leva direto ao Funil do app.
        hrefFor: (roles) => pushHrefFor(roles),
        labelFor: (roles, { pendingPush }) =>
          pendingPush && pendingPush > 0 && canAccess(roles, "push.approve")
            ? `Notificações push (${pendingPush})`
            : "Notificações push",
      },
    ],
  },
  {
    label: G.control,
    items: [
      // Contingência primeiro e em destaque (item 50): é o que se procura numa emergência.
      { ...CONTINGENCY_NAV, emphasis: true },
      {
        href: "/estudio/control",
        label: "Visão geral",
        icon: "gauge",
        action: "metrics.view",
        exact: true,
        subgroup: SUB.operation,
      },
      {
        href: "/estudio/control/tempo-real",
        label: "Tempo real",
        icon: "activity",
        action: "metrics.view",
        subgroup: SUB.operation,
      },
      {
        href: "/estudio/control/falhas",
        label: "Falhas",
        icon: "circle-alert",
        action: "source.manage",
        countKey: "failures",
        subgroup: SUB.operation,
      },
      {
        href: "/estudio/control/execucoes",
        label: "Execuções",
        icon: "history",
        action: "metrics.view",
        subgroup: SUB.operation,
      },
      {
        href: "/estudio/control/logs",
        label: "Registros",
        icon: "scroll-text",
        action: "audit.view",
        subgroup: SUB.operation,
      },
      {
        href: "/estudio/control/custos",
        label: "Custos",
        icon: "percent",
        action: "metrics.view",
        subgroup: SUB.operation,
      },
      {
        href: "/estudio/control/conhecimento",
        label: "Bases de conhecimento",
        icon: "database",
        action: "metrics.view",
        subgroup: SUB.ai,
      },
      {
        href: "/estudio/control/agentes",
        label: "Agentes",
        icon: "settings",
        action: "metrics.view",
        subgroup: SUB.ai,
      },
      {
        href: "/estudio/control/modelos",
        label: "Modelos",
        icon: "layers",
        action: "metrics.view",
        subgroup: SUB.ai,
      },
      {
        href: "/estudio/control/testes",
        label: "Testar prompts",
        icon: "play",
        action: "prompt.publish",
        subgroup: SUB.ai,
      },
      {
        href: "/estudio/control/avaliacoes",
        label: "Avaliações",
        icon: "flask-conical",
        action: "metrics.view",
        subgroup: SUB.ai,
      },
      {
        href: "/estudio/control/governanca",
        label: "Governança da IA",
        icon: "shield",
        action: "metrics.view",
        subgroup: SUB.ai,
      },
      {
        href: "/estudio/control/recomendacao",
        label: "Recomendação",
        icon: "trending-up",
        action: "metrics.view",
        subgroup: SUB.ai,
      },
      {
        href: "/estudio/control/fontes",
        label: "Fontes",
        icon: "globe",
        action: "source.manage",
        subgroup: SUB.sourcesRules,
      },
      {
        href: "/estudio/control/regras",
        label: "Regras",
        icon: "scale",
        action: "rules.propose",
        subgroup: SUB.sourcesRules,
      },
      {
        href: "/estudio/control/aprovacoes",
        label: "Aprovações",
        icon: "file-check",
        action: "rules.propose",
        countKey: "approvals",
        subgroup: SUB.sourcesRules,
      },
    ],
  },
  {
    label: G.admin,
    items: ADMIN_MENU,
  },
];

function visible(it: Entry, roles: RoleGrant[]): boolean {
  if (it.visibleFor) return it.visibleFor(roles);
  if (it.anyOf) return it.anyOf.some((a) => canAccess(roles, a));
  return it.action === undefined || canAccess(roles, it.action);
}

/** Navegação lateral do Estúdio filtrada pelo papel (docs/screens.md, shell do Estúdio). */
export function studioNav(roles: RoleGrant[], opts: StudioNavOptions = {}): StudioNavGroup[] {
  return GROUPS.map((group) => ({
    label: group.label,
    items: group.items
      .filter((it) => visible(it, roles))
      .map((it): StudioNavItem => {
        const count = it.countKey ? opts.counts?.[it.countKey] : undefined;
        const item: StudioNavItem = {
          href: it.hrefFor ? it.hrefFor(roles) : it.href,
          label: it.labelFor ? it.labelFor(roles, opts) : it.label,
          icon: it.icon,
          exact: it.exact,
        };
        if (count !== undefined && count > 0) item.count = count;
        if (it.countKind) item.countKind = it.countKind;
        if (it.emphasis) item.emphasis = true;
        if (it.subgroup) item.subgroup = it.subgroup;
        return item;
      }),
  })).filter((group) => group.items.length > 0);
}
