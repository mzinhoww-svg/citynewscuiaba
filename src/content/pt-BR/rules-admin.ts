/** Textos da tela de regras de autonomia (O05, P5-T2). */
import type { Mode, Route } from "@/lib/rules";

export const MODE_TEXT: Record<Mode, string> = {
  auto: "Automático",
  auto_notify: "Automático com aviso",
  review: "Revisão",
  blocked: "Bloqueada",
};

export const ROUTE_TEXT: Record<Route, string> = {
  publish: "publicar",
  publish_notify: "publicar e avisar",
  review: "revisão",
  hold: "retenção",
};

export const CATEGORY_TEXT: Record<string, string> = {
  servicos: "Serviços",
  agenda: "Agenda",
  clima: "Clima",
  cidade: "Cidade",
  economia: "Economia",
  esportes: "Esportes",
  cultura: "Cultura",
  politica: "Política",
  saude: "Saúde",
  seguranca: "Segurança",
};

export const categoryText = (key: string) => CATEGORY_TEXT[key] ?? key;

/** Ordem da spec §6.4 (o jsonb do banco reordena as chaves); categorias novas vão ao fim. */
export function orderedCategories<T>(categories: Record<string, T>): [string, T][] {
  const known = Object.keys(CATEGORY_TEXT);
  return Object.entries(categories).sort(([a], [b]) => {
    const ia = known.indexOf(a);
    const ib = known.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
}

export const RULE_FIELD_TEXT = {
  mode: "Modo",
  minSources: "Mín. fontes",
  requirePrimary: "Exige primária",
  requireApprovedImage: "Exige imagem aprovada",
  minScore: "Confiança mínima",
  summaryWords: "Resumo (palavras)",
  forceReview: "Revisão obrigatória",
  sensitiveTopics: "Temas sensíveis",
} as const;

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

export const RULES_TEXT = {
  sectionLabel: "Control Center",
  title: "Regras de autonomia",
  intro:
    "O que publica sozinho, o que vai para revisão e o que fica bloqueado. Toda versão nova é proposta por uma pessoa e ativada por outra; antes de propor, simule com os últimos 7 dias.",
  activeTitle: (v: number) => `Versão ativa: v${v}`,
  noActive: "Nenhuma versão ativa: tudo vai para revisão (falha fechada).",
  forceReviewOn: "Revisão obrigatória ligada: nada é publicado sozinho.",
  forceReviewOff:
    "Revisão obrigatória desligada: as categorias em modo automático publicam sozinhas.",
  matrixCaption: (v: number) => `Regras por categoria da versão ${v}`,
  sensitiveLabel: "Temas sensíveis (sempre revisão)",
  proposalsTitle: "Propostas aguardando aprovação",
  proposalLine: (v: number, who: string) => `v${v}, proposta por ${who}`,
  diffTitle: (v: number) => `O que muda na v${v}`,
  noDiff: "Sem diferença em relação à versão ativa.",
  versionsTitle: "Histórico de versões",
  col: {
    version: "Versão",
    status: "Situação",
    proposedBy: "Proposta por",
    approvedBy: "Aprovada por",
    when: "Quando",
    forceReview: "Revisão obrigatória",
  },
  status: { active: "Ativa", approved: "Aprovada", pending: "Aguardando", invalid: "Inválida" },
  yes: "sim",
  no: "não",
  form: {
    title: "Propor nova versão",
    intro:
      "Edite a matriz a partir da versão ativa. A proposta só entra em vigor depois da aprovação de outra pessoa (admin ou editor-chefe).",
    editCaption: "Proposta: regras por categoria",
    field: (category: string, field: string) => `${field} de ${category}`,
    sensitiveTopics: "Temas sensíveis (um por linha)",
    sensitiveHint:
      "Qualquer item com um destes temas na categoria ou nas etiquetas vai para revisão.",
    forceReview: "Manter a revisão obrigatória (nada publica sozinho)",
    forceReviewCritical:
      "Desligar a revisão obrigatória é mudança crítica: pede aprovação do tipo “desligar a revisão obrigatória”.",
    justification: "Justificativa",
    justificationHint:
      "Por que mudar e o que os últimos dias mostraram. Fica na aprovação e na auditoria.",
    justificationRequired: "Justificativa obrigatória.",
    simulate: "Simular com os últimos 7 dias",
    simulating: "Simulando…",
    propose: "Propor versão",
    proposing: "Enviando…",
    simulateFirst: "Simule antes de propor: a proposta leva o resultado da simulação.",
    noChanges: "A proposta é igual à versão ativa.",
    result: (changed: number, total: number) =>
      total === 0
        ? "Nenhum item decidido nos últimos 7 dias: a simulação não tem amostra."
        : `${changed} de ${total} ${plural(total, "item mudaria", "itens mudariam")} de destino.`,
    resultLine: (from: string, to: string, count: number) => `${count} de ${from} para ${to}`,
    proposed: (v: number) =>
      `Versão v${v} proposta. Aguardando a aprovação de outra pessoa na caixa de aprovações.`,
    invalid: "A proposta tem valores fora da faixa.",
    conflict: "Outra pessoa propôs uma versão agora. Recarregue e tente de novo.",
    forbidden: "Seu papel não propõe regras.",
    genericError: "Não foi possível enviar a proposta. Tente de novo.",
    approvalFailed:
      "Versão gravada, mas o pedido de aprovação não foi criado. Peça pela caixa de aprovações.",
  },
  errorTitle: "Não foi possível carregar as regras",
  errorBody: "O banco não respondeu agora. Tente de novo em instantes.",
  retry: "Tentar de novo",
} as const;
