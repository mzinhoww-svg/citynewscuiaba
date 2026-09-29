import type { RuleApprovalKind, RuleProblemCode, RuleValue } from "@/lib/rules/critical";
import type { Mode } from "@/lib/rules/types";

/** Textos da tela de regras de autonomia (Control Center · Regras; P5-T2). */

export const RULE_MODE_LABEL: Record<Mode, string> = {
  auto: "Automático",
  auto_notify: "Automático com aviso",
  review: "Revisão",
  blocked: "Bloqueada",
};

export const RULE_ROUTE_LABEL: Record<string, string> = {
  publish: "Publicar",
  publish_notify: "Publicar com aviso",
  review: "Revisão humana",
  hold: "Retida",
};

export const RULE_CATEGORY_LABEL: Record<string, string> = {
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

/** Ordem de exibição das categorias (spec §6.4). */
export const CATEGORY_ORDER: readonly string[] = Object.keys(RULE_CATEGORY_LABEL);

export const categoryLabel = (key: string): string => RULE_CATEGORY_LABEL[key] ?? key;

const FIELD_LABEL: Record<string, string> = {
  forceReview: "Revisão obrigatória (forceReview)",
  sensitiveTopics: "Temas sensíveis",
  exists: "Categoria",
  mode: "Modo",
  minSources: "Mínimo de fontes",
  requirePrimary: "Exige fonte primária",
  requireApprovedImage: "Exige imagem aprovada",
  minScore: "Confiança mínima",
  summaryWords: "Resumo (palavras)",
};

const n2 = (x: number) => x.toFixed(2).replace(".", ",");

/** Valor de um campo por extenso (diferença entre versões). */
export function ruleValueText(key: string, v: RuleValue): string {
  if (v === null) return "não se aplica";
  if (Array.isArray(v)) return v.length === 0 ? "nenhum" : v.join(", ");
  if (typeof v === "boolean") {
    if (key === "exists") return v ? "existe" : "não existe";
    if (key === "forceReview") return v ? "ligada" : "desligada";
    return v ? "sim" : "não";
  }
  if (key === "mode" && typeof v === "string") return RULE_MODE_LABEL[v as Mode] ?? v;
  if (key === "minScore" && typeof v === "number") return n2(v);
  return String(v);
}

export function ruleFieldLabel(category: string | null, key: string): string {
  const field = FIELD_LABEL[key] ?? key;
  return category ? `${categoryLabel(category)} · ${field}` : field;
}

export const RULE_KIND_NOTE: Record<RuleApprovalKind, string> = {
  "rules.activate": "Ativação de regras: outra pessoa (administração ou chefia de redação) aprova.",
  "force_review.disable":
    "Esta versão desliga a revisão obrigatória (forceReview): pede a aprovação “Desligar revisão obrigatória”.",
  "safety.disable":
    "Esta versão afrouxa uma regra de segurança (tema sensível removido ou Segurança desbloqueada): pede a aprovação “Desligar regra de segurança”.",
};

export const RULES_ADMIN_TEXT = {
  title: "Regras de autonomia",
  intro:
    "O que o motor publica sozinho, por categoria. Toda mudança vira uma versão nova, é simulada com os últimos 7 dias e só entra em vigor com a aprovação de outra pessoa.",
  loading: "Carregando as regras de autonomia",
  errorTitle: "Não foi possível carregar as regras",
  errorBody: "O banco não respondeu agora. Nada foi alterado. Tente de novo em instantes.",
  retry: "Tentar de novo",
  currentTitle: "Versão em vigor",
  currentNone:
    "Nenhuma versão válida em vigor: o motor usa as regras de reserva, com revisão obrigatória em tudo.",
  currentLine: (v: number, who: string | null, when: string) =>
    `Versão ${v}${who ? `, aprovada por ${who}` : ""}, proposta em ${when}.`,
  forceReviewOn:
    "Revisão obrigatória ligada: nada é publicado sozinho, qualquer que seja a categoria.",
  forceReviewOff: "Revisão obrigatória desligada: vale o modo de cada categoria.",
  topicsLine: (topics: string[]) =>
    `Temas sensíveis (sempre revisão): ${topics.length > 0 ? topics.join(", ") : "nenhum"}.`,
  neverAutoNote:
    "Segurança e notícia urgente nunca publicam sozinhas: Segurança só aceita Bloqueada ou Revisão, em qualquer versão.",
  matrixCaption: (v: number | null) =>
    v === null ? "Regras da proposta, por categoria" : `Regras da versão ${v}, por categoria`,
  colCategory: "Categoria",
  colMode: "Modo",
  colMinSources: "Mín. fontes",
  colPrimary: "Exige primária",
  colImage: "Exige imagem aprovada",
  colMinScore: "Confiança mínima",
  colSummary: "Resumo (palavras)",
  yes: "Sim",
  no: "Não",
  notApplicable: "n/a",
  fieldLabel: (field: string, category: string) => `${field}, ${category}`,

  proposalTitle: "Nova proposta",
  proposalIntro:
    "Parte da versão em vigor. Ajuste, simule com os últimos 7 dias e proponha com justificativa.",
  forceReviewLabel: "Revisão obrigatória (forceReview)",
  forceReviewHint: "Ligada, nada publica sozinho. Desligar pede aprovação própria.",
  topicsLabel: "Temas sensíveis",
  topicsHint: "Um por linha. Tirar um tema pede a aprovação “Desligar regra de segurança”.",
  kindsTitle: "Aprovação que esta proposta vai pedir",
  simulate: "Simular com os últimos 7 dias",
  simulating: "Simulando…",
  simulationTitle: "Simulação",
  simulationStale: "A proposta mudou depois da simulação. Simule de novo antes de propor.",
  simulationEmpty: (days: number) =>
    `Nenhum item decidido pelo motor nos últimos ${days} dias: não há o que comparar. A proposta pode seguir mesmo assim.`,
  simulationSummary: (changed: number, total: number, days: number) =>
    `${changed} de ${total} ${total === 1 ? "item" : "itens"} dos últimos ${days} dias ${changed === 1 ? "mudaria" : "mudariam"} de destino.`,
  simulationNone: "Nenhum destino muda com esta proposta.",
  simulationCaption: "Mudanças de destino na simulação",
  colFrom: "Destino hoje",
  colTo: "Destino com a proposta",
  colCount: "Itens",
  changesTitle: "O que muda em relação à versão em vigor",
  changesNone: "Nenhum campo mudou. Ajuste a proposta antes de propor.",
  changesCaption: "Campos alterados",
  colField: "Campo",
  colBefore: "Em vigor",
  colAfter: "Proposta",
  justificationLabel: "Justificativa",
  justificationHint: "Obrigatória. Quem aprova lê este texto.",
  propose: "Propor nova versão",
  proposing: "Propondo…",
  proposeBlocked: "Simule a proposta atual e escreva a justificativa para propor.",
  proposed: (v: number) =>
    `Versão ${v} proposta. Ela entra em vigor quando outra pessoa aprovar em Aprovações.`,
  goApprovals: "Ir para Aprovações",

  versionsTitle: "Versões",
  versionsCaption: "Versões das regras de autonomia",
  colVersion: "Versão",
  colStatus: "Situação",
  colProposer: "Proposta por",
  colApprover: "Aprovada por",
  colCreated: "Proposta em",
  colCompare: "Comparar",
  compareLink: (v: number) => `Comparar a versão ${v} com a em vigor`,
  compareShort: "Comparar",
  compareTitle: (v: number, cur: number) => `Versão ${v} comparada com a versão ${cur}`,
  statusActive: "Em vigor",
  statusPending: "Aguardando aprovação",
  statusRejected: "Recusada",
  statusDraft: "Proposta sem pedido",
  statusRetired: "Substituída",
  statusInvalid: "Inválida",
  unknownPerson: "Pessoa removida",
  nobody: "—",

  invalidDraft: "Proposta inválida: confira os campos da tabela.",
  forbidden: "Seu papel não permite propor regras de autonomia.",
  justificationRequired: "Escreva a justificativa da proposta.",
  simulateFirst: "Simule a proposta atual antes de propor (a proposta ou a versão em vigor mudou).",
  neverAutoDb: "Segurança e notícia urgente não podem publicar sozinhas.",
  versionRace: "Outra proposta foi criada ao mesmo tempo. Tente de novo.",
  simulateError: "Não foi possível simular agora. Tente de novo em instantes.",
  problem: (field: string, code: RuleProblemCode) => {
    const [, category, key] = field.split(".");
    const where = category ? ruleFieldLabel(category, key ?? "") : ruleFieldLabel(null, field);
    switch (code) {
      case "never_auto":
        return `${where}: Segurança e notícia urgente só aceitam Bloqueada ou Revisão.`;
      case "empty":
        return `${where}: informe ao menos um tema, sem linhas vazias.`;
      case "range":
        return `${where}: valor fora da faixa (fontes 0 a 10, confiança 0 a 1, resumo 10 a 400).`;
    }
  },
} as const;
