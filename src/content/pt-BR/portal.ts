import type { ConfidenceLevel } from "@/lib/confidence";
import type { TopicState } from "@/lib/db/queries/types";

/** Textos do portal público (P1). */

/** Assinatura de matéria escrita por agente, sem autor humano. */
export const BYLINE = {
  newsroom: "Redação CityNews",
} as const;

export const CONFIDENCE_TEXT: Record<ConfidenceLevel, string> = {
  alta: "Confiança alta",
  média: "Confiança média",
  baixa: "Confiança baixa",
};

export const TOPIC_STATE_TEXT: Record<TopicState, string> = {
  em_apuracao: "Em apuração",
  confirmado: "Confirmado",
  corrigido: "Corrigido",
  encerrado: "Encerrado",
};

export const MADE_HOW = {
  title: "Como esta matéria foi feita",
  reviewedBy: (name: string) => `Revisado por ${name}.`,
  agent: (version: string) =>
    `Texto preparado pelo agente ${version}, dentro das regras de autonomia.`,
  versions: "Ver histórico de versões",
  methodology: "Entenda a metodologia",
  methodologyHref: "/metodologia",
} as const;

export const CARD = {
  origin: "Origem",
  summary20s: "Resumo em 20 s",
  openIn: (source: string) => `Abrir em ${source}`,
  newTab: "abre em nova aba",
  by: (name: string) => `Por ${name}`,
  topicCounts: (articles: number, sources: number) =>
    `${articles === 1 ? "1 matéria" : `${articles} matérias`} · ${sources === 1 ? "1 fonte" : `${sources} fontes`}`,
  updated: (when: string) => `atualizado ${when}`,
  collectionItems: (n: number) => (n === 1 ? "1 item" : `${n} itens`),
  now: "Agora",
  nextCycle: (min: number) => `Próximo ciclo em ${min} min`,
} as const;

export const NEWSLETTER = {
  title: "Receba a newsletter",
  intro: "O resumo do dia em Cuiabá, cedo, no seu e-mail. Só pedimos o endereço.",
  label: "E-mail",
  placeholder: "voce@exemplo.com",
  submit: "Inscrever",
  sending: "Enviando…",
  invalid: "Confira o e-mail digitado. Exemplo: ana@exemplo.com",
  rateLimited: "Muitas tentativas a partir desta conexão. Tente de novo em uma hora.",
  error: "Não conseguimos registrar agora. Tente de novo em alguns minutos.",
  success:
    "Inscrição recebida. Quando o envio começar, você recebe um e-mail para confirmar; sem confirmação, nada é enviado.",
  privacy: "Você pode sair da lista a qualquer momento.",
  honeypotLabel: "Não preencha este campo",
} as const;

export const HOME = {
  urgent: "Urgente",
  place: "Cuiabá e Várzea Grande",
  updatedAt: (hour: string) => `Atualizado às ${hour}`,
  topics: "Assuntos em destaque",
  topicsMore: "/assuntos",
  collections: "Coleções",
  collectionsMore: "/explorar",
  nearby: "Perto de você",
  nearbyText:
    "Escolha seu bairro para ver notícias, obras e eventos perto de você. Não precisa de conta.",
  nearbyCta: "Escolher bairro",
  nearbyHref: "/perfil#bairro",
  agenda: "Agenda",
  agendaMore: "/agenda",
  agendaEmpty: "Nenhum evento confirmado nos próximos dias.",
  free: "Gratuito",
  price: (cents: number) =>
    (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
  services: "Serviços",
  servicesMore: "/servicos",
  mostRead: "Mais lidas em Cuiabá",
  mostReadTag: "Popular em Cuiabá",
  sources: "Fontes em destaque",
  sourcesMore: "/fontes",
  aggregatedTitle: "Veja também em outros portais",
  aggregatedNotice:
    "Links para matérias de outros veículos. O CityNews não republica esses textos: eles abrem no site de origem.",
  aggregatedMore: "Ver Panorama de fontes",
  sectionMore: (name: string) => `Mais de ${name}`,
  emptyTitle: "CityNews Cuiabá",
  emptyText: "Ainda não há matérias publicadas. Enquanto isso, veja a agenda da cidade.",
  errorTitle: "CityNews Cuiabá",
  errorText:
    "Não conseguimos carregar as notícias agora. A agenda e as páginas da cidade continuam disponíveis.",
  retry: "Tentar de novo",
  seeAgenda: "Ver agenda",
  loading: "Carregando notícias",
} as const;

/** Atalhos de serviço da home (P01): destinos fixos, sem depender do banco. */
export const HOME_SERVICES = [
  {
    href: "/servicos?sub=clima",
    title: "Clima e qualidade do ar",
    description: "Alertas da Defesa Civil e previsão",
    icon: "sun",
  },
  {
    href: "/guia-cuiaba",
    title: "Ônibus e trânsito",
    description: "Linhas, desvios e obras",
    icon: "map-pin",
  },
  {
    href: "/servicos",
    title: "Vagas e cursos",
    description: "Mutirões de emprego e inscrições",
    icon: "users",
  },
  {
    href: "/agenda",
    title: "O que fazer",
    description: "Eventos gratuitos e pagos da semana",
    icon: "calendar",
  },
] as const;

/** Editoria (P02). */
export const SECTION_PAGE = {
  metaTitle: (name: string) => `${name} · CityNews Cuiabá`,
  metaDescription: (name: string) =>
    `Notícias de ${name} em Cuiabá e Várzea Grande, com origem de cada matéria sempre visível.`,
  updated: (when: string) =>
    /^(há|agora)/.test(when) ? `Atualizado ${when}` : `Atualizado em ${when}`,
  today: (n: number) =>
    n === 0 ? "nenhuma matéria hoje" : n === 1 ? "1 matéria hoje" : `${n} matérias hoje`,
  subsections: "Subeditorias",
  allSubsections: "Tudo",
  filters: "Filtros",
  activeFilters: (n: number) => (n === 1 ? "1 ativo" : `${n} ativos`),
  period: "Período",
  periods: {
    "24h": "Últimas 24 horas",
    "7d": "Últimos 7 dias",
    "30d": "Últimos 30 dias",
    all: "Qualquer data",
  },
  periodPhrase: {
    "24h": "nas últimas 24 horas",
    "7d": "nos últimos 7 dias",
    "30d": "nos últimos 30 dias",
    all: "",
  },
  neighborhood: "Bairro",
  allNeighborhoods: "Todos os bairros",
  origin: "Origem",
  origins: { all: "Todas", original: "Original CityNews", normalized: "Normalizado pelo CityNews" },
  order: "Ordenar por",
  orders: { recent: "Mais recentes", relevance: "Relevância" },
  apply: "Aplicar filtros",
  clear: "Limpar filtros",
  list: (name: string) => `Matérias de ${name}`,
  count: (shown: number, total: number) => `Mostrando ${shown} de ${total}`,
  loadMore: "Carregar mais",
  mostRead: (name: string) => `Mais lidas em ${name}`,
  newItems: (n: number) => (n === 1 ? "1 nova matéria · mostrar" : `${n} novas matérias · mostrar`),
  emptyTitle: (what: string, where: string, period: string) =>
    ["Nenhuma matéria de", what, where, period].filter(Boolean).join(" "),
  emptyText:
    "A redação e o motor de coleta publicam ao longo do dia. Amplie o filtro ou volte mais tarde.",
  widen: {
    period30: "Ver últimos 30 dias",
    periodAll: "Ver todo o período",
    neighborhood: "Ver todos os bairros",
    reset: "Limpar filtros",
  },
  errorTitle: (name: string) => `Não conseguimos carregar ${name} agora`,
  errorText: "Pode ser uma instabilidade passageira. Seus filtros continuam no endereço da página.",
  retry: "Tentar de novo",
  backHome: "Voltar ao início",
  loading: "Carregando matérias",
} as const;

/** Linha fina das editorias (P02). */
export const SECTION_DESCRIPTION: Record<string, string> = {
  cidade: "Bairros, obras, mobilidade e serviços públicos de Cuiabá e Várzea Grande.",
  politica: "Prefeitura, Câmara, Assembleia e governo do estado, com as fontes de cada informação.",
  economia: "Emprego, preços, agro e negócios da Baixada Cuiabana.",
  cultura: "Teatro, música, festas tradicionais e a cena cultural da cidade.",
  esportes: "Futebol, esporte amador e eventos esportivos em Cuiabá.",
  entretenimento: "Shows, cinema e lazer para a semana.",
  gastronomia: "Onde comer, feiras e a cozinha cuiabana.",
  servicos: "Clima, vagas, documentos e utilidade pública.",
  "guia-cuiaba": "Guias permanentes para viver e circular em Cuiabá.",
  mobilidade: "Ônibus, trânsito, obras viárias e desvios.",
};

/** Informar problema (P03, ReportProblemForm). */
export const REPORT = {
  open: "Informar problema",
  title: "Informar problema nesta matéria",
  intro: "Não precisa de conta. A redação lê cada aviso.",
  kindLegend: "O que está errado?",
  kinds: {
    wrong_info: "Informação errada",
    broken_link: "Link quebrado",
    image: "Problema com a imagem",
    right_of_reply: "Direito de resposta",
    other: "Outro problema",
  },
  message: "Conte o que viu (opcional)",
  messageHint: "Até 1.000 caracteres. Exemplo: o horário certo é 19h, não 18h.",
  contact: "Seu e-mail para resposta (opcional)",
  contactPlaceholder: "voce@exemplo.com",
  submit: "Enviar",
  sending: "Enviando…",
  kindRequired: "Escolha o tipo de problema. Exemplo: Informação errada.",
  invalidEmail: "Confira o e-mail digitado. Exemplo: ana@exemplo.com",
  rateLimited:
    "Você atingiu o limite de 5 envios por hora a partir desta conexão. Tente de novo mais tarde.",
  error: "Não conseguimos registrar agora. Tente de novo em alguns minutos.",
  success: "Recebemos seu aviso. Resposta da redação em até 24 h.",
  honeypotLabel: "Não preencha este campo",
  close: "Fechar",
} as const;

/** Matéria (P03), histórico (P04) e ações de leitura. */
export const ARTICLE = {
  breadcrumb: "Você está em",
  home: "Início",
  published: "Publicado em",
  updated: "Atualizado em",
  readMinutes: (n: number) => `${n} min de leitura`,
  sources: (n: number) => (n === 1 ? "1 fonte" : `${n} fontes`),
  actions: "Ações da matéria",
  aiTitle: "Resumo em poucos segundos",
  aiReviewed: (name: string) => `Resumo revisado por ${name}.`,
  aiNotReviewed:
    "Resumo ainda sem revisão humana, publicado dentro das regras de autonomia. Confira no texto completo.",
  aiUseful: "Foi útil?",
  yes: "Sim",
  no: "Não",
  thanks: "Obrigado pelo retorno.",
  updateNote: "Atualização",
  correctionNote: "Correção",
  noteAt: (when: string) => `em ${when}`,
  seeChanges: "Ver o que mudou",
  sourcesTitle: "Fontes",
  sourcesIntro: "Onde o CityNews encontrou cada informação. Os links abrem no site de origem.",
  ownReporting: "Apuração própria da redação do CityNews.",
  role: { primary: "Fonte primária", secondary: "Fonte secundária", context: "Contexto" },
  confirmed: "Confirmada pela redação",
  unconfirmed: "Ainda não confirmada",
  openSource: (name: string) => `Abrir em ${name}`,
  newTab: "abre em nova aba",
  tags: "Temas",
  topicTag: (title: string) => `Assunto: ${title}`,
  ask: "Pergunte sobre esta matéria",
  askIntro: "A busca com IA responde só com fontes e mostra de onde veio cada frase.",
  askQuestions: (title: string, topic?: string) => [
    topic ? `O que já se sabe sobre “${topic}”?` : `O que já se sabe sobre “${title}”?`,
    "O que ainda não foi confirmado neste caso?",
    "Quais fontes oficiais tratam deste assunto?",
  ],
  related: "Semelhantes",
  imageCredit: (credit: string) => `Crédito: ${credit}`,
  updatedWhileReading: (hour: string) => `Esta matéria foi atualizada às ${hour}`,
  reload: "Recarregar",
  share: "Compartilhar",
  shareTitle: "Compartilhar matéria",
  shareWhatsapp: "WhatsApp",
  shareEmail: "E-mail",
  copyLink: "Copiar link",
  copied: "Link copiado.",
  adjust: "Ajustar leitura",
  adjustTitle: "Ajustar leitura",
  textSize: "Tamanho do texto",
  sizes: { md: "Padrão", lg: "Grande", xl: "Maior" },
  theme: "Tema",
  themes: { light: "Claro", dark: "Escuro" },
  done: "Pronto",
  goneTitle: "Esta matéria foi retirada do ar",
  goneCorrections: "Ver correções publicadas",
  errorTitle: "Não conseguimos carregar esta matéria agora",
  errorText: "Pode ser uma instabilidade passageira. Tente de novo em alguns minutos.",
  historyTitle: "Histórico de versões",
  historyIntro:
    "Todas as versões publicadas desta matéria, da mais recente para a primeira. Não mostramos rascunhos nem comentários internos da redação.",
  historyLegend:
    "Legenda: trechos acrescentados aparecem sublinhados e com o aviso “acrescentado”; trechos removidos aparecem riscados e com o aviso “removido”.",
  added: "acrescentado",
  removed: "removido",
  version: (n: number) => `Versão ${n}`,
  versionKind: { edit: "Publicação", update: "Atualização", correction: "Correção" },
  firstVersion: "Primeira versão publicada.",
  noChanges: "Sem mudança no texto.",
  backToArticle: "Voltar para a matéria",
  historyEmpty: "Esta matéria ainda não tem versões publicadas.",
} as const;
