import type { CriticalKind } from "@/lib/approvals/kinds";

/** Textos da aprovação dupla (Control Center · Aprovações; P5-T1). */
export const APPROVALS_TEXT = {
  title: "Aprovações",
  intro:
    "Mudanças críticas só entram em vigor com duas pessoas: uma pede, com justificativa, e outra decide.",
  loading: "Carregando as aprovações",
  pendingTitle: "Pendentes",
  pendingCaption: "Pedidos de aprovação pendentes",
  recentTitle: "Decididas recentemente",
  recentCaption: "Últimas decisões",
  emptyTitle: "Nada esperando aprovação",
  emptyBody: "Quando alguém pedir uma mudança crítica, o pedido aparece aqui.",
  noRecent: "Nenhuma decisão registrada ainda.",
  errorTitle: "Não foi possível carregar as aprovações",
  errorBody:
    "O banco não respondeu agora. Nenhuma decisão foi perdida. Tente de novo em instantes.",
  retry: "Tentar de novo",
  eyebrow: "Aprovação dupla",
  requestedBy: "Pedido por",
  justification: "Justificativa",
  target: "Alvo",
  approve: "Aprovar",
  reject: "Recusar",
  approveNamed: (what: string) => `Aprovar: ${what}`,
  rejectNamed: (what: string) => `Recusar: ${what}`,
  requesterNote: "Você fez este pedido. A aprovação precisa ser de outra pessoa.",
  observerNote: (who: string) => `Quem decide: ${who}.`,
  approved: "Aprovação registrada.",
  rejected: "Recusa registrada.",
  unknownPerson: "Pessoa removida",
  colKind: "Mudança",
  colTarget: "Alvo",
  colRequester: "Pedido por",
  colDecider: "Decidido por",
  colStatus: "Situação",
  colWhen: "Pedido em",
} as const;

/** Mensagens das recusas de `approve`/`reject` (a de autoaprovação é fixa: Review Focus 1). */
export const APPROVAL_ERROR_TEXT = {
  self_approval: "A aprovação precisa ser de outra pessoa",
  forbidden: "Seu papel não permite decidir este pedido.",
  not_pending: "Este pedido não está mais pendente. Atualize a página.",
  invalid: "Pedido inválido: escreva a justificativa e confira o alvo.",
} as const;

export const APPROVAL_KIND_LABEL: Record<CriticalKind, string> = {
  "rules.activate": "Ativar regras de autonomia",
  "safety.disable": "Desligar regra de segurança",
  "force_review.disable": "Desligar revisão obrigatória (forceReview)",
  "prompt.publish": "Publicar prompt em produção",
  "rec.weights": "Ativar pesos de recomendação",
  "role.admin": "Conceder papel de administração",
  "push.urgent": "Enviar push urgente",
};

/** Alvo por extenso, a partir do tipo e da referência. */
export function approvalTargetLabel(kind: CriticalKind, ref: string): string {
  switch (kind) {
    case "rules.activate":
    case "safety.disable":
    case "force_review.disable":
      return `Regras, versão ${ref}`;
    case "rec.weights":
      return `Pesos, versão ${ref}`;
    case "role.admin":
      return `Pessoa ${ref.slice(0, 8)}`;
    case "prompt.publish":
      return `Prompt ${ref.slice(0, 8)}`;
    case "push.urgent":
      return `Matéria ${ref.slice(0, 8)}`;
  }
}

/** O que acontece ao aprovar (efeito `activate` ou `authorize`). */
export const APPROVAL_EFFECT_TEXT = {
  activate: "Ao aprovar, a versão entra em vigor na hora e a anterior sai.",
  authorize: "Ao aprovar, a ação fica liberada para ser feita uma vez.",
} as const;

export const APPROVAL_STATUS_LABEL: Record<string, string> = {
  pending: "Pendente",
  approved: "Aprovada",
  rejected: "Recusada",
  applied: "Aplicada",
};
