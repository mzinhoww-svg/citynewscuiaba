/** Textos das aprovações de mudança crítica (P5-T1): caixa de aprovações e faixa nas telas. */
import type { CriticalKind } from "@/lib/approvals/approvals";
import type { ApprovalTarget } from "@/lib/approvals/targets";
import { AGENT_NAME } from "./ai-control";
import { CRITICAL_FIELD_TEXT, criticalValueText } from "./sources-admin";

export { APPROVAL_ERROR_TEXT } from "./sources-admin";

export const KIND_TEXT: Record<CriticalKind, string> = {
  "rules.activate": "Ativar regras de autonomia",
  "force_review.disable": "Desligar a revisão obrigatória",
  "safety.disable": "Desligar uma proteção",
  "prompt.publish": "Publicar prompt em produção",
  "rec.weights": "Pesos de recomendação",
  "role.admin": "Conceder papel de administração",
  "push.urgent": "Push urgente",
  "push.highlight": "Push de destaque",
  "push.resume": "Retomar envios de push",
  "source.critical": "Mudança crítica de fonte",
};

export const FLAG_TEXT: Record<string, string> = {
  auto_publish: "publicação automática",
  read_only: "modo leitura",
  ai_enabled: "busca com IA",
  personalization_enabled: "personalização",
  image_reproduction_enabled: "reprodução de imagem de terceiros",
  source_link_analysis: "análise de fonte por link",
  sponsored_native_enabled: "patrocinado nativo",
  ads_enabled: "banners",
};

/** "regras v3", "publicação automática → ligada", "política de imagem → reprodução". */
export function targetText(target: ApprovalTarget): string {
  switch (target.kind) {
    case "rules":
      return `regras v${target.version}`;
    case "flag":
      return `${FLAG_TEXT[target.key] ?? target.key} → ${target.value ? "ligada" : "desligada"}`;
    case "source":
      return `${CRITICAL_FIELD_TEXT[target.field] ?? target.field} → ${criticalValueText(target.field, target.value)}`;
    case "prompt":
      return `prompt v${target.version} de ${AGENT_NAME[target.agentId] ?? target.agentId}`;
    case "rec":
      return `pesos de recomendação ${target.version}`;
    case "user":
      return `papel de administração para a conta ${target.userId.slice(0, 8)}`;
    case "other":
      return target.ref;
  }
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

export const APPROVALS_TEXT = {
  sectionLabel: "Control Center",
  title: "Aprovações",
  intro:
    "Mudança crítica só entra em vigor com duas pessoas: quem pede nunca decide. Aqui ficam os pedidos abertos e os últimos decididos.",
  pendingTitle: (n: number) =>
    n === 0
      ? "Nenhum pedido aguardando"
      : `${n} ${plural(n, "pedido aguarda", "pedidos aguardam")} decisão`,
  emptyTitle: "Nenhum pedido aguardando decisão",
  emptyBody: "Propostas de regras, prompts, pesos e papéis aparecem aqui assim que alguém pedir.",
  historyTitle: "Últimas decisões",
  historyEmpty: "Nenhuma decisão registrada ainda.",
  col: {
    kind: "Tipo",
    target: "Mudança",
    requestedBy: "Pedido por",
    when: "Quando",
    justification: "Justificativa",
    status: "Situação",
    decidedBy: "Decidido por",
    actions: "Ações",
  },
  status: {
    pending: "Aguardando",
    approved: "Aprovado (sem aplicar)",
    rejected: "Recusado",
    applied: "Aplicado",
  } as Record<string, string>,
  someone: "outra pessoa",
  review: "Revisar",
  reviewAt: "Revisar na fonte",
  ownRequest: "Seu pedido",
  waitOther: "A aprovação precisa ser de outra pessoa",
  noRole: "Seu papel não decide este tipo de pedido",
  approved: "Pedido aprovado e aplicado.",
  approvedApplyElsewhere: "Pedido aprovado. Agora aplique na tela do alvo.",
  applyAt: "Aplicar na tela",
  approvedNotApplied: (why: string) => `Pedido aprovado, mas não aplicado: ${why}`,
  rejected: "Pedido recusado.",
  applyError: {
    already_applied: "já tinha sido aplicado.",
    not_approved: "o pedido não está aprovado.",
    expired: "a aprovação expirou (mais de 24 h). Peça de novo.",
    forbidden: "só quem aprovou aplica.",
    not_found: "o alvo não existe mais ou já foi decidido.",
    unsupported: "este tipo se aplica na tela do próprio alvo.",
  } as Record<string, string>,
  genericError: "Não foi possível registrar a decisão. Tente de novo.",
  errorTitle: "Não foi possível carregar as aprovações",
  errorBody: "O banco não respondeu agora. Tente de novo em instantes.",
  retry: "Tentar de novo",
  dialog: {
    title: "Decidir pedido",
    change: "Mudança",
    requestedBy: "Pedido por",
    justification: "Justificativa do pedido",
    approve: "Aprovar e aplicar",
    reject: "Recusar",
    rejectReason: "Motivo da recusa",
    confirmReject: "Confirmar recusa",
    rejectRequired: "Informe o motivo da recusa.",
    selfNote: "Você fez este pedido: a aprovação precisa ser de outra pessoa.",
    cancel: "Cancelar",
  },
  banner: {
    title: (n: number) =>
      `${n} ${plural(n, "pedido aguarda", "pedidos aguardam")} segunda aprovação`,
    line: (what: string, who: string) => `${what}, pedido por ${who}`,
    open: "Ver aprovações",
  },
} as const;
