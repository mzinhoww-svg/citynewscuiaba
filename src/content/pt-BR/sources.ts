import type { RankList } from "@/lib/ranking/types";

/** Fontes em destaque (P14, spec §7.5). Textos da tela; justificativas ficam em `recommendations`. */
export const SOURCES_PAGE = {
  metaTitle: "Fontes em destaque · CityNews Cuiabá",
  metaDescription:
    "Veículos de Cuiabá e de Mato Grosso que o CityNews acompanha: mais acessados, em alta, locais e verificados, com a origem de cada notícia.",
  title: "Fontes em destaque",
  intro:
    "Veículos de Cuiabá, de Mato Grosso e nacionais que o CityNews acompanha. Siga os que quiser, sem cadastro: fica guardado neste navegador.",
  notice: "Popularidade não é selo de qualidade.",
  noticeDetail:
    "As listas mostram o que os leitores mais acessam, não uma avaliação dos veículos. Nenhuma fonte ocupa mais de 25% de uma lista.",
  capNote: "Nenhuma fonte ocupa mais de 25% desta lista.",
  personalization: "Recomendações personalizadas",
  personalizationOn: "Ligadas: usamos o que você lê neste navegador para recomendar fontes.",
  personalizationOff:
    "Desligadas: mostramos fontes populares da região, sem usar seu histórico de leitura.",
  personalizationHow: "Como usamos suas recomendações",
  personalizationHowHref: "/privacidade",
  tabsLabel: "Listas de fontes",
  tabs: {
    popular: "Mais acessadas",
    trending: "Em alta nesta semana",
    recommended: "Recomendadas para você",
    followed: "Fontes que você segue",
    local: "Fontes locais",
    verified: "Fontes verificadas",
    new: "Novas para descobrir",
  } satisfies Record<RankList, string>,
  filtersLabel: "Filtrar fontes",
  groups: { period: "Período", region: "Região", theme: "Tema" },
  filters: {
    hoje: "Hoje",
    semana: "Nesta semana",
    tendencia: "Tendência",
    cuiaba: "Cuiabá",
    mt: "Mato Grosso",
    nacional: "Nacionais",
    cultura: "Cultura",
    esportes: "Esporte",
    economia: "Economia",
    servicos: "Serviços",
  },
  clearFilters: "Limpar filtros",
  noHistoryTitle: "Ainda sem histórico seu",
  noHistoryText:
    "Sem histórico de leitura, mostramos as fontes mais acessadas da região e as fontes locais. Siga as que quiser acompanhar.",
  noHistoryOff:
    "As recomendações personalizadas estão desligadas: nada do que você lê é usado. Estas são as fontes mais acessadas da região e as fontes locais.",
  localPicks: "Fontes locais para começar",
  followedEmptyTitle: "Você ainda não segue nenhuma fonte",
  followedEmptyText:
    "Toque em Seguir em qualquer fonte. A escolha fica guardada neste navegador, sem cadastro.",
  followedEmptyAction: "Ver fontes locais",
  emptyTitle: "Nenhuma fonte nesta lista com esses filtros",
  emptyText: "Tire um filtro ou veja outra lista.",
  hiddenTitle: (n: number) => (n === 1 ? "1 fonte ocultada" : `${n} fontes ocultadas`),
  showAgain: "Mostrar de novo",
  showAgainLabel: (name: string) => `Mostrar ${name} de novo`,
  hiddenDone: (name: string) => `${name} não aparece mais nas suas listas.`,
  personalizationDone: "Recomendações personalizadas desligadas.",
  undo: "Desfazer",
  itemsTitle: "Últimas das fontes mais acessadas",
  itemsNotice: "Links para outros veículos: abrem no site de cada fonte.",
  errorTitle: "Não conseguimos carregar as fontes agora",
  errorText:
    "Pode ser uma instabilidade passageira. As notícias do CityNews continuam na página inicial.",
  retry: "Tentar de novo",
  unconfiguredTitle: "As fontes ainda não estão disponíveis",
  unconfiguredText:
    "O CityNews ainda está preparando a lista de veículos acompanhados. Enquanto isso, as notícias e a agenda continuam no ar.",
  backHome: "Ir para a página inicial",
  loading: "Carregando as fontes",
} as const;

/** Editorias das fontes por extenso (categorias do cadastro). */
export const SOURCE_CATEGORY_TEXT: Record<string, string> = {
  cidade: "Cidade",
  politica: "Política",
  economia: "Economia",
  cultura: "Cultura",
  esportes: "Esportes",
  servicos: "Serviços",
  agenda: "Agenda",
  clima: "Clima",
  entretenimento: "Entretenimento",
  gastronomia: "Gastronomia",
};

/** Página da fonte (P15). */
export const SOURCE_PAGE_TEXT = {
  metaTitle: (name: string) => `${name} · Fontes · CityNews Cuiabá`,
  metaDescription: (name: string, where: string) =>
    `Notícias de ${name} (${where}) acompanhadas pelo CityNews, com link para o original. Como o CityNews exibe o conteúdo desta fonte.`,
  breadcrumb: "Trilha",
  sourcesLink: "Fontes",
  intro: (categories: string, where: string) =>
    `Veículo de ${where} que cobre ${categories}. O CityNews mostra só título, data, um resumo próprio quando a fonte permite e o link para o original.`,
  openSite: "Abrir site da fonte",
  openSiteLabel: (name: string) => `Abrir site de ${name}, abre em nova aba`,
  statsLabel: "Números aproximados",
  reach: "Alcance aproximado em 30 dias",
  today: "Matérias hoje",
  updated: "Última atualização",
  filterLabel: "Filtrar por editoria",
  all: "Todas",
  itemsTitle: "Últimas desta fonte",
  itemsNotice: "Cada item abre no site da fonte, em nova aba.",
  itemsEmpty: "Nenhum item recente desta fonte",
  itemsEmptyFiltered: "Nenhum item recente nesta editoria",
  itemsEmptyText: "Quando a fonte publicar, os links aparecem aqui.",
  brokenLink: "Link quebrado?",
  brokenLinkLabel: (title: string) => `Avisar link quebrado: ${title}`,
  brokenLinkSending: "Enviando…",
  brokenLinkDone: "Obrigado. A redação confere em até 24 h.",
  aboutTitle: "Sobre esta fonte no CityNews",
  integration: "Integração",
  kinds: {
    rss: "Feed RSS",
    sitemap: "Sitemap de notícias",
    api: "API oficial",
    page: "Página pública",
    newsletter: "Newsletter",
    social: "Rede social",
    events: "Agenda de eventos",
  } as Record<string, string>,
  frequency: "Frequência",
  every: (min: number) => (min % 60 === 0 ? `A cada ${min / 60} h` : `A cada ${min} min`),
  display: "Exibição",
  displayText: {
    summary_2_sentences: "Título, data, resumo próprio do CityNews (até 2 frases) e link",
    link_only: "Só título, data e link",
  } as Record<string, string>,
  images: "Imagens",
  imagesText: {
    none: "Sem imagens da fonte",
    with_agreement: "Só com acordo registrado",
    licensed_only: "Só imagens licenciadas",
    reproduction: "Reprodução com crédito e link",
  } as Record<string, string>,
  agreement: "Acordo",
  agreementUntil: (date: string) => `Vigente até ${date}`,
  noAgreement: "Sem acordo: só link para o original",
  availability: "Disponibilidade em 30 dias",
  availabilityText: (pct: number) => `${pct}% das coletas`,
  availabilityNone: "Ainda sem histórico de coleta",
  contact: "Correção ou remoção",
  contactText: "Fale com a redação",
  contactHref: "/contato",
  notFound: "Fonte não encontrada",
  errorTitle: "Não conseguimos carregar esta fonte agora",
  errorText: "Pode ser uma instabilidade passageira. A lista de fontes continua disponível.",
  backToSources: "Ver todas as fontes",
  loading: "Carregando a fonte",
} as const;

/** Panorama de fontes (P16): camada secundária, sempre em superfície neutra e rotulada. */
export const PANORAMA_TEXT = {
  metaTitle: "Panorama de fontes · CityNews Cuiabá",
  metaDescription:
    "O que outros veículos de Cuiabá e Mato Grosso publicaram, com link para o original e comparação de coberturas.",
  title: "Panorama de fontes",
  eyebrow: "AGREGADO · OUTROS VEÍCULOS",
  intro:
    "O que outros veículos publicaram, com a origem de cada link. É uma camada secundária: a reportagem do CityNews continua na página inicial.",
  notice: "Tudo nesta página é de outros veículos e abre no site de cada um.",
  homeLink: "Ver as notícias do CityNews",
  themes: "Temas",
  allThemes: "Todos",
  compareTitle: "Comparar coberturas",
  compareIntro: (topic: string) => `Assunto mais ativo agora: ${topic}.`,
  compareSummary: (covered: number, missing: number) =>
    `${covered === 1 ? "1 veículo cobriu" : `${covered} veículos cobriram`} · ${
      missing === 1 ? "1 sem cobertura" : `${missing} sem cobertura`
    }`,
  citynews: "CityNews",
  citynewsCount: (n: number) =>
    n === 0 ? "Sem matéria própria ainda" : n === 1 ? "1 matéria" : `${n} matérias`,
  citynewsLink: "Ver cobertura do CityNews",
  itemsCount: (n: number) => (n === 1 ? "1 item" : `${n} itens`),
  covered: "Cobriu",
  first: "Primeira a publicar",
  difference: (hours: number) =>
    hours < 1 ? "Menos de 1 h depois da primeira" : `${hours} h depois da primeira`,
  noCoverage: "Sem cobertura",
  compareEmpty: "Nenhum assunto com cobertura de vários veículos agora.",
  latestTitle: "Mais recentes das suas fontes",
  order: "Ordem",
  orderRecent: "Recentes",
  /** Ordena pela popularidade da fonte, não da matéria (UX-W4-T4, item 73). */
  orderRead: "Fontes mais lidas primeiro",
  picker: "Fontes exibidas",
  pickerCount: (shown: number, total: number) => `${shown} de ${total} fontes`,
  pickerHint: "A escolha fica só neste navegador.",
  pickerAll: "Todas",
  pickerFollowed: "Só as que sigo",
  latestEmpty: "Nenhum item das fontes escolhidas",
  latestEmptyText: "Escolha mais fontes acima ou veja todas.",
  showAll: "Mostrar todas",
  errorTitle: "Não conseguimos carregar o Panorama agora",
  errorText: "Pode ser uma instabilidade passageira. As notícias do CityNews continuam no ar.",
  unconfiguredTitle: "O Panorama ainda não está disponível",
  unconfiguredText:
    "O CityNews ainda está preparando a lista de veículos acompanhados. As notícias e a agenda continuam no ar.",
  retry: "Tentar de novo",
  loading: "Carregando o Panorama",
} as const;
