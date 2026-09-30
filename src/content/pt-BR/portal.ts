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
  openOriginal: "Abrir original",
  by: (name: string) => `Por ${name}`,
  topicCounts: (articles: number, sources: number) =>
    `${articles === 1 ? "1 matéria" : `${articles} matérias`} · ${sources === 1 ? "1 fonte" : `${sources} fontes`}`,
  updated: (when: string) => `atualizado ${when}`,
  collectionItems: (n: number) => (n === 1 ? "1 item" : `${n} itens`),
  now: "Agora",
  nextCycle: (min: number) => `Próximo ciclo em ${min} min`,
} as const;

export { NEWSLETTER } from "./newsletter";

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

/** Assunto (P05) e lista de assuntos (P06). */
export const TOPIC = {
  metaTitle: (t: string) => `${t} · Assunto · CityNews Cuiabá`,
  eyebrow: "Assunto",
  counts: (articles: number, sources: number) =>
    `${articles === 1 ? "1 matéria do CityNews" : `${articles} matérias do CityNews`} · ${sources === 1 ? "1 veículo" : `${sources} veículos`}`,
  updated: (when: string) => `atualizado ${when}`,
  investigating:
    "Em apuração: as informações ainda estão sendo confirmadas e podem mudar. Os pontos em aberto estão listados abaixo.",
  closed: (date: string) => `Assunto encerrado. Sem novidades desde ${date}.`,
  summaryTitle: "O que se sabe",
  summaryReviewed: (name: string) => `Resumo revisado por ${name}.`,
  summaryNotReviewed: "Resumo ainda sem revisão humana. Confira nas matérias e fontes abaixo.",
  agree: "As fontes concordam",
  diverge: "As fontes divergem",
  unconfirmed: "Ainda não confirmado",
  nothing: "Nada registrado até agora.",
  filterLabel: "Mostrar",
  filterOrigin: { all: "Tudo", citynews: "Do CityNews", external: "Outros veículos" },
  filterSource: "Veículo",
  allSources: "Todos os veículos",
  fromCityNews: "Do CityNews",
  fromCityNewsEmpty: "O CityNews ainda não publicou matéria própria sobre este assunto.",
  external: "Cobertura de outros veículos",
  externalNotice:
    "Links para matérias de outros veículos. O CityNews não republica esses textos: eles abrem no site de origem.",
  externalEmpty: "Nenhum outro veículo com cobertura registrada.",
  timeline: "Linha do tempo",
  timelineCityNews: "CityNews",
  confidenceHow: "Como medimos a confiança",
  confidenceHowText:
    "A confiança combina quantas fontes independentes confirmam o fato, se há fonte primária (oficial) e quão recente é a informação.",
  confidenceHowLink: "Entenda a metodologia",
  faq: "Perguntas frequentes",
  errorTitle: "Não conseguimos carregar este assunto agora",
  listTitle: "Assuntos",
  listIntro:
    "Os fatos que o CityNews acompanha, com o que já foi confirmado, o que diverge entre as fontes e o que falta apurar.",
  listMeta: "Assuntos · CityNews Cuiabá",
  listFilters: "Filtrar assuntos",
  listAll: "Todos",
  listStates: {
    em_apuracao: "Em apuração",
    confirmado: "Confirmados",
    corrigido: "Corrigidos",
    encerrado: "Encerrados",
  },
  listWeek: "Da semana",
  listSection: "Editoria",
  listAllSections: "Todas as editorias",
  listApply: "Filtrar",
  listEmpty: "Nenhum assunto com esses filtros",
  listEmptyText: "Tente outra situação ou veja todos os assuntos.",
  listSeeAll: "Ver todos os assuntos",
  listError: "Não conseguimos carregar os assuntos agora",
  loading: "Carregando assuntos",
} as const;

/** Sugerir evento (P11). */
export const SUGGEST = {
  metaTitle: "Sugerir um evento · Agenda · CityNews Cuiabá",
  title: "Sugerir um evento",
  intro:
    "Não precisa de conta. A equipe de Agenda confere cada sugestão com a organização antes de publicar.",
  required: "obrigatório",
  optional: "opcional",
  fields: {
    title: "Nome do evento",
    startsAt: "Data e hora de início",
    endsAt: "Data e hora de fim",
    venue: "Local",
    neighborhood: "Bairro",
    free: "Entrada gratuita",
    price: "Preço (R$)",
    ageRating: "Faixa etária",
    link: "Link oficial",
    description: "Descrição",
    email: "E-mail do responsável",
    consent:
      "Autorizo o CityNews a usar estas informações na Agenda e a entrar em contato por este e-mail.",
  },
  hints: {
    startsAt: "Horário de Cuiabá.",
    venue: "Exemplo: Sesc Arsenal, rua 13 de Junho.",
    price: "Deixe em branco se a entrada for gratuita. Exemplo: 30,00",
    description: "Até 500 caracteres.",
    email: "Usado só para confirmar a sugestão; não aparece no site.",
  },
  placeholders: {
    title: "Feira de discos no Sesc Arsenal",
    venue: "Sesc Arsenal",
    price: "30,00",
    link: "https://",
    email: "voce@exemplo.com",
  },
  ages: {
    livre: "Livre",
    "10": "10 anos",
    "12": "12 anos",
    "14": "14 anos",
    "16": "16 anos",
    "18": "18 anos",
  },
  otherNeighborhood: "Outro ou não sei",
  errors: {
    title: "Informe o nome do evento, com 3 a 120 caracteres. Exemplo: Feira de discos",
    startsAt: "Informe a data de início. Exemplo: 10/10/2026, 19:00",
    startsPast: "A data de início já passou. Exemplo: 10/10/2026, 19:00",
    endsAt: "O fim precisa ser depois do início. Exemplo: 10/10/2026, 23:00",
    venue: "Informe o local. Exemplo: Sesc Arsenal",
    price: "Informe o preço em reais ou marque entrada gratuita. Exemplo: 30,00",
    link: "Use um link que comece com https://. Exemplo: https://site.com/evento",
    description: "A descrição pode ter até 500 caracteres.",
    email: "Informe um e-mail válido. Exemplo: ana@exemplo.com",
    consent: "Marque a autorização para enviar a sugestão.",
  },
  summary: (n: number) =>
    n === 1 ? "Confira 1 campo destacado abaixo." : `Confira os ${n} campos destacados abaixo.`,
  submit: "Enviar sugestão",
  sending: "Enviando…",
  success: "Sugestão recebida. A equipe de Agenda revisa em até 48 h e avisa por e-mail.",
  another: "Sugerir outro evento",
  backAgenda: "Voltar para a agenda",
  rateLimited:
    "Você atingiu o limite de 5 envios por hora a partir desta conexão. Tente de novo mais tarde.",
  error:
    "Não conseguimos registrar agora. Tente de novo em alguns minutos; seus dados continuam no formulário.",
  honeypotLabel: "Não preencha este campo",
} as const;

/** Agenda (P09) e evento (P10). */
export const AGENDA = {
  metaTitle: "Agenda · CityNews Cuiabá",
  metaDescription:
    "O que fazer em Cuiabá e Várzea Grande: eventos gratuitos e pagos, com local, horário e acessibilidade.",
  eyebrow: "Agenda",
  title: "O que fazer em Cuiabá",
  intro:
    "Eventos confirmados pela organização ou por fonte oficial. Sugestões de leitores passam pela redação.",
  suggest: "Sugerir um evento",
  view: "Visualização",
  list: "Lista",
  calendar: "Calendário",
  filters: "Filtros da agenda",
  when: "Quando",
  whens: {
    today: "Hoje",
    weekend: "Fim de semana",
    "7d": "Próximos 7 dias",
    "30d": "Próximos 30 dias",
  },
  category: "Categoria",
  allCategories: "Todas as categorias",
  categories: {
    cultura: "Cultura",
    musica: "Música",
    teatro: "Teatro",
    cinema: "Cinema",
    esporte: "Esporte",
    feira: "Feira",
    gastronomia: "Gastronomia",
    infantil: "Infantil",
  } as Record<string, string>,
  neighborhood: "Bairro",
  allNeighborhoods: "Todos os bairros",
  origin: "Origem do evento",
  allOrigins: "Todas as origens",
  origins: {
    official: "Oficial",
    organizer: "Organização",
    reader: "Sugerido por leitor (aprovado)",
  },
  freeOnly: "Só gratuitos",
  kidsOnly: "Para crianças",
  apply: "Aplicar filtros",
  clear: "Limpar filtros",
  day: (date: string) => `Eventos de ${date}`,
  seeAllDates: "Ver todas as datas",
  results: (n: number) => (n === 1 ? "1 evento" : `${n} eventos`),
  free: "Gratuito",
  price: (cents: number) =>
    (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
  age: (a: string) => (a === "livre" ? "Classificação livre" : `A partir de ${a} anos`),
  emptyTitle: (parts: {
    free: boolean;
    kids: boolean;
    category?: string;
    where?: string;
    period: string;
  }) =>
    [
      "Nenhum evento",
      parts.category ? `de ${parts.category.toLowerCase()}` : "",
      parts.free ? "gratuito" : "",
      parts.kids ? "para crianças" : "",
      parts.where ?? "",
      parts.period,
    ]
      .filter(Boolean)
      .join(" "),
  periodPhrase: {
    today: "hoje",
    weekend: "neste fim de semana",
    "7d": "nos próximos 7 dias",
    "30d": "nos próximos 30 dias",
  },
  onDay: (date: string) => `em ${date}`,
  inMonth: "neste mês",
  emptyText: "A agenda recebe novos eventos todos os dias. Amplie o período ou sugira um evento.",
  widen30: "Ver próximos 30 dias",
  clearAll: "Ver todos os eventos",
  errorTitle: "Não conseguimos carregar a agenda agora",
  errorText: "Pode ser uma instabilidade passageira. Seus filtros continuam no endereço da página.",
  retry: "Tentar de novo",
  loading: "Carregando eventos",
  prevMonth: "Mês anterior",
  nextMonth: "Próximo mês",
  weekdays: ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"],
  weekdaysLong: ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"],
  dayEvents: (n: number) => (n === 1 ? "1 evento" : `${n} eventos`),
  dayLink: (date: string, n: number) => `${date}: ${n === 1 ? "1 evento" : `${n} eventos`}`,
  noEventsDay: "sem eventos",
  // Evento (P10)
  when2: "Data e hora",
  where: "Local",
  directions: "Como chegar",
  newTab: "abre em nova aba",
  priceLabel: "Preço",
  ageLabel: "Classificação",
  accessibility: "Acessibilidade",
  description: "Sobre o evento",
  originLabel: "Origem da informação",
  confirmed: (date: string) => `Informações confirmadas pela organização em ${date}.`,
  addToCalendar: "Adicionar ao calendário",
  ics: "Baixar arquivo .ics",
  google: "Google Agenda",
  related: "Mais eventos de",
  eventError: "Não conseguimos carregar este evento agora",
  backAgenda: "Voltar para a agenda",
  until: (hour: string) => `até ${hour}`,
  nextDay: "do dia seguinte",
} as const;
