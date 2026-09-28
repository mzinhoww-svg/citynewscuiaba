import type { Role } from "@/lib/auth";

export const STUDIO_TEXT = {
  name: "Estúdio",
  nav: "Estúdio",
  signedInAs: "Conectado como",
  welcome: "Bem-vindo ao Estúdio",
  intro:
    "Redação, Control Center e Governança ficam aqui. A navegação lateral mostra só o que o seu papel permite.",
  loading: "Carregando",
  backToSite: "Ver o portal",
} as const;

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Administração",
  editor_chefe: "Editor-chefe",
  editor: "Editor",
  jornalista: "Jornalista",
  revisor: "Revisor",
  operador_ia: "Operador de IA",
  analista: "Analista",
  moderador: "Moderador",
  leitura: "Leitura",
};

export const ARTICLE_STATUS_LABEL = {
  draft: "Rascunho",
  in_review: "Em revisão",
  changes_requested: "Ajustes pedidos",
  approved: "Aprovada",
  scheduled: "Agendada",
  published: "Publicada",
  updated: "Atualizada",
  archived: "Arquivada",
  unpublished: "Despublicada",
} as const;

/** Rota recomendada pelas regras (decisions.recommended). */
export const RECOMMENDED_LABEL: Record<string, string> = {
  publish: "Publicar",
  publish_notify: "Publicar e avisar",
  review: "Revisar",
  hold: "Reter",
};

export const CONFIDENCE_LABEL = { alta: "Alta", média: "Média", baixa: "Baixa" } as const;

export const QUEUE_TEXT = {
  newsroomTitle: "Newsroom",
  queueTitle: "Fila de matérias",
  kpiRegion: "Indicadores do dia",
  kpi: {
    publishedToday: "Publicadas hoje",
    auto24h: "Automáticas em 24 h",
    exceptions: "Fila de exceção",
    overdue: "Prazo vencido",
    scheduled: "Agendadas",
  },
  tabsLabel: "Abas da fila",
  tabs: {
    all: "Tudo",
    exceptions: "Fila de exceção",
    auto24h: "Publicadas automaticamente em 24 h",
    mine: "Minha fila",
    sensitive: "Temas sensíveis",
  },
  autoBanner: (n: number) =>
    n === 1
      ? "1 matéria foi publicada automaticamente nas últimas 24 h. Confira e despublique com motivo se algo estiver errado."
      : `${n} matérias foram publicadas automaticamente nas últimas 24 h. Confira e despublique com motivo se algo estiver errado.`,
  autoBannerLink: "Ver publicadas automaticamente",
  seeAll: "Ver fila completa",
  caption: "Matérias da fila",
  scrollRegion: "Tabela da fila (role para os lados no celular)",
  col: {
    select: "Selecionar",
    title: "Matéria",
    status: "Estado",
    recommended: "Recomendação da IA",
    assignee: "Responsável",
    due: "Prazo",
    actions: "Ações",
  },
  selectRow: (title: string) => `Selecionar "${title}"`,
  noAssignee: "Sem responsável",
  noRecommendation: "Sem recomendação",
  noDue: "Sem prazo",
  overdue: "Vencido",
  sensitive: "Tema sensível",
  aiFallback: "Sem IA",
  pipeline: "Pipeline",
  auto: "Automática",
  open: "Abrir",
  review: "Revisar",
  unpublish: "Despublicar",
  unpublishTitle: "Despublicar matéria automática",
  unpublishIntro:
    "A matéria sai do portal na hora. O motivo fica registrado na decisão humana e na auditoria.",
  reason: "Motivo",
  reasonHint: "Ex.: data incorreta no alerta",
  reasonRequired: "Escreva o motivo da despublicação",
  confirm: "Confirmar",
  cancel: "Cancelar",
  unpublished: (title: string) => `Despublicada: ${title}`,
  notAuto: "Só matérias publicadas automaticamente podem ser despublicadas por aqui.",
  notPublished: "A matéria não está publicada.",
  notDraft: "Só rascunhos ou matérias com ajuste pedido voltam para revisão.",
  forbidden: "Seu papel não permite esta ação nesta matéria.",
  genericError: "Não foi possível concluir. Tente de novo.",
  bulkLabel: "Ações em lote",
  bulkSelected: (n: number) =>
    n === 0 ? "Nenhuma selecionada" : n === 1 ? "1 selecionada" : `${n} selecionadas`,
  assignTo: "Atribuir a",
  assignButton: "Atribuir selecionadas",
  assigned: (n: number) => (n === 1 ? "1 matéria atribuída" : `${n} matérias atribuídas`),
  requestReview: "Pedir revisão",
  reviewRequested: (n: number) =>
    n === 1 ? "1 matéria enviada para revisão" : `${n} matérias enviadas para revisão`,
  unpublishSelected: "Despublicar automáticas",
  unpublishedMany: (n: number) =>
    n === 1 ? "1 matéria despublicada" : `${n} matérias despublicadas`,
  failedSome: (n: number) => (n === 1 ? "1 não foi alterada" : `${n} não foram alteradas`),
  filters: "Filtros",
  filterApply: "Filtrar",
  filterClear: "Limpar filtros",
  filter: {
    status: "Estado",
    section: "Editoria",
    origin: "Origem",
    confidence: "Confiança",
    assignee: "Responsável",
    due: "Prazo",
    any: "Todos",
    me: "Eu",
    none: "Sem responsável",
    original: "Original da redação",
    pipeline: "Pipeline",
    auto: "Publicada automaticamente",
    overdue: "Vencido",
    today: "Até hoje",
  },
  emptyTitle: "Nada na fila",
  empty: {
    all: "Nenhuma matéria com esses filtros.",
    exceptions: "O pipeline não mandou nenhum item para revisão humana.",
    auto24h: "Nenhuma matéria foi publicada automaticamente nas últimas 24 h.",
    mine: "Nenhuma matéria atribuída a você ou em andamento com a sua autoria.",
    sensitive: "Nenhuma matéria de tema sensível em aberto.",
  },
  errorTitle: "A fila não carregou",
  errorBody: "O banco não respondeu. Tente de novo em instantes; nada foi alterado.",
  retry: "Tentar de novo",
  loading: "Carregando a fila",
} as const;
