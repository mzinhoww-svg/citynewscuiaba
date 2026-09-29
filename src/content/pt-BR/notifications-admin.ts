/**
 * Textos de A09 · Notificações no Estúdio (spec 2026-09-28 §10): abas, estados, erros das
 * ações, faixas do cabeçalho e o diálogo de publicação (E06).
 */
import type { PushKind, SendStatus } from "@/lib/push/types";

export const PUSH_ADMIN_TEXT = {
  title: "Notificações",
  intro:
    "Avisos no celular e no computador de quem ativou. Urgente e Destaque passam por duas pessoas.",
  sectionNav: "Seções de Notificações",
  tabs: {
    new: "Novo envio",
    queue: "Fila e aprovações",
    history: "Histórico",
    settings: "Configurações",
  },
  funnelLink: "Funil do app",
  banners: {
    paused: (by: string, at: string, reason: string) =>
      `Envios pausados por ${by} às ${at}: ${reason}`,
    pausedShort: "Envios pausados",
    pending: (n: number) =>
      n === 1 ? "1 pedido aguarda sua aprovação" : `${n} pedidos aguardam sua aprovação`,
    pendingLink: "Ver a fila",
    vapidMissing: (names: string[]) =>
      `Push indisponível: configure ${names.join(", ")} na Vercel.`,
    vapidOk: "Chaves VAPID configuradas",
  },
  followNote: "Avisos do que o leitor segue são automáticos e não passam por aqui.",
  kind: {
    urgent: "Urgente",
    highlight: "Destaque da redação",
    follow: "Do que o leitor segue",
  } satisfies Record<PushKind, string>,
  status: {
    pending_approval: "Aguardando aprovação",
    scheduled: "Agendado",
    queued: "Na fila de envio",
    dispatching: "Enviando",
    sent: "Enviado",
    paused: "Pausado",
    cancelled: "Cancelado",
    rejected: "Recusado",
    expired: "Expirado",
  } satisfies Record<SendStatus, string>,
  audience: {
    all: (kind: PushKind) =>
      kind === "urgent"
        ? "Todos que ativaram Urgentes"
        : kind === "highlight"
          ? "Todos que ativaram Destaques"
          : "Quem segue a matéria",
    section: (name: string) => `Editoria: ${name}`,
    bairro: (name: string) => `Bairro: ${name}`,
  },
  reach: {
    fewer: "menos de 20",
    about: (n: number) => `cerca de ${n}`,
    label: "Alcance estimado",
  },
  approval: {
    pending: "Pendente",
    by: (name: string, at: string) => `Aprovado por ${name} às ${at}`,
  },
  errors: {
    self_approval: "A aprovação precisa ser de outra pessoa.",
    forbidden: "Sua conta não tem permissão para esta ação.",
    not_pending: "Este pedido já foi decidido.",
    invalid: "Revise os campos destacados.",
    article_invalid: "Só matéria publicada e não patrocinada vira aviso.",
    conflict: "O pedido mudou depois que você abriu. Recarregue e tente de novo.",
    unavailable: "Não foi possível concluir agora. Tente de novo em instantes.",
    rateLimited: "Você fez muitas ações na última hora. Tente de novo mais tarde.",
    reasonRequired: "Informe o motivo.",
    justificationRequired: "Justificativa obrigatória para urgente.",
    typePause: "Digite PAUSAR para confirmar.",
    schedule: {
      urgent_now_only: "Urgente só sai agora.",
      past: "O horário já passou.",
      too_far: "Agende no máximo 7 dias à frente.",
      quiet: "Fora do silêncio: escolha um horário entre 7h e 22h.",
      invalid: "Data ou hora inválida.",
    },
  },
  done: {
    requested: "Pedido criado. Aguardando aprovação de outra pessoa.",
    requestedPaused: "Pedido criado. Envios pausados: o pedido fica na fila até a retomada.",
    approved: "Pedido aprovado",
    approvedScheduled: "Pedido aprovado. Sai no horário agendado.",
    rejected: "Pedido recusado",
    cancelled: "Envio cancelado",
    paused: "Envios pausados. Tudo, inclusive os automáticos, fica parado até a retomada.",
    resumeRequested: "Retomada pedida. Outra pessoa com permissão de aprovar precisa confirmar.",
    resumed: "Envios retomados",
    settingsSaved: "Configurações salvas",
  },
  pauseWord: "PAUSAR",
} as const;

export type PushAdminErrorKey = keyof Pick<
  typeof PUSH_ADMIN_TEXT.errors,
  | "self_approval"
  | "forbidden"
  | "not_pending"
  | "invalid"
  | "article_invalid"
  | "conflict"
  | "unavailable"
>;
