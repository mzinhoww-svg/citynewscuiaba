/** Textos da central de notificações da equipe (o sino do Estúdio). pt-BR. */
import type { Severity } from "@/lib/studio-notifications/types";

export const BELL_TEXT = {
  region: "Central de notificações",
  button: (unread: number) =>
    unread > 0
      ? `Notificações, ${unread} ${unread === 1 ? "não lida" : "não lidas"}`
      : "Notificações, nenhuma não lida",
  shortcutHint: "Atalho: Alt + N",
  panelTitle: "Notificações",
  close: "Fechar notificações",
  onlyUnread: "Só não lidas",
  markAll: "Marcar todas como lidas",
  markOne: (title: string) => `Marcar como lida: ${title}`,
  read: "Lida",
  unread: "Não lida",
  loading: "Carregando notificações",
  emptyTitle: "Nada novo por aqui",
  emptyBody: "Quando algo pedir a sua ação, aparece nesta lista.",
  emptyUnreadTitle: "Nenhuma notificação não lida",
  emptyUnreadBody: "Desmarque o filtro para ver as anteriores.",
  errorTitle: "Não foi possível carregar as notificações",
  errorBody: "Tente de novo em instantes. Suas notificações continuam guardadas.",
  retry: "Tentar de novo",
  seeAll: "Ver todas as notificações",
  seePush: "Ver push",
  announceNew: (n: number) => (n === 1 ? "1 nova notificação" : `${n} novas notificações`),
  stale: "Não foi possível atualizar agora. Mostrando a última lista.",
} as const;

export const SEVERITY_TEXT: Record<Severity, string> = {
  urgent: "Urgentes",
  warn: "Pedem atenção",
  info: "Informativas",
};

export const SEVERITY_BADGE: Record<Severity, string> = {
  urgent: "Urgente",
  warn: "Atenção",
  info: "Informação",
};

/** Tipos para o filtro da página completa (rótulo curto). */
export const KIND_TEXT: Record<string, string> = {
  reports_burst: "Denúncias",
  reports_overdue: "Denúncias vencidas",
  approval_pending: "Aprovações",
  breaker_open: "Disjuntor",
  source_paused: "Fontes",
  review_overdue: "Revisão vencida",
  correction_pending: "Correções",
  reply_pending: "Direito de resposta",
  event_suggestion: "Sugestões de evento",
  push_urgent_pending: "Push urgente",
  forced_publish_done: "Publicação forçada",
  ai_failures: "Falhas de IA",
  backlog_released: "Backlog liberado",
};

export const NOTIFICATIONS_PAGE_TEXT = {
  title: "Notificações da equipe",
  intro:
    "Tudo o que pede a ação do seu papel: aprovações, denúncias, fontes, disjuntor, push e mais. Cada item leva direto à tela de ação.",
  filterKind: "Tipo",
  allKinds: "Todos os tipos",
  filterStatus: "Situação",
  all: "Todas",
  unread: "Não lidas",
  loadMore: "Ver mais antigas",
  empty: "Nenhuma notificação com esse filtro.",
  markAll: "Marcar todas como lidas",
  open: "Abrir",
  errorTitle: "Não foi possível carregar o histórico",
  errorBody: "O banco não respondeu agora. Tente de novo em instantes.",
} as const;

export const STUDIO_PUSH_CARD_TEXT = {
  title: "Notificações push",
  open: "Abrir notificações push",
  queue: "Na fila",
  pending: "Aguardando aprovação",
  lastDelivery: "Última entrega",
  none: "Nenhuma ainda",
  unavailable: "O estado do push não carregou agora.",
  optInTitle: "Urgências da central no seu navegador",
  optInBody:
    "Receba um aviso do sistema quando algo urgente pedir a sua ação. Só urgências, nunca o resto, e só neste navegador.",
  optInOn: "Urgências ativadas neste navegador",
  enable: "Ativar urgências",
  disable: "Desativar urgências",
  denied: "O navegador bloqueou os avisos. Libere nas configurações do site e tente de novo.",
  unsupported: "Este navegador não recebe avisos.",
  failed: "Não foi possível ativar agora. Tente de novo.",
} as const;
