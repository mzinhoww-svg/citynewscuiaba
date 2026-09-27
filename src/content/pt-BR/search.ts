import type { SearchOrigin, SearchPeriod, SearchType } from "@/lib/search/query";

/** Busca tradicional (docs/screens.md P12). */
export const SEARCH = {
  title: "Busca",
  metaDescription: "Busque matérias, assuntos, eventos e notícias de outros veículos de Cuiabá.",
  documentTitle: (q: string) => (q ? `Busca: ${q} · CityNews Cuiabá` : "Busca · CityNews Cuiabá"),
  boxLabel: "Buscar no CityNews",
  placeholder: "Ônibus, viaduto, agenda, bairro…",
  submit: "Buscar",
  suggestions: "Sugestões",
  recent: "Buscas recentes",
  removeRecent: (q: string) => `Remover “${q}” das buscas recentes`,
  askAi: "Perguntar à IA",
  askAiHint: "com o mesmo texto",
  tabs: "Tipo de resultado",
  types: {
    all: "Tudo",
    articles: "Matérias",
    topics: "Assuntos",
    events: "Eventos",
    services: "Serviços",
    aggregated: "Outros veículos",
  } satisfies Record<SearchType, string>,
  origin: "Origem",
  origins: {
    all: "Todas as origens",
    citynews: "Só CityNews",
    others: "Outros veículos",
  } satisfies Record<SearchOrigin, string>,
  filters: "Filtros",
  section: "Editoria",
  allSections: "Todas as editorias",
  period: "Período",
  periods: {
    all: "Qualquer data",
    "24h": "Últimas 24 horas",
    "7d": "Últimos 7 dias",
    "30d": "Últimos 30 dias",
  } satisfies Record<SearchPeriod, string>,
  apply: "Aplicar filtros",
  clear: "Limpar filtros",
  count: (n: number, q: string) =>
    n === 1 ? `1 resultado para “${q}”` : `${n} resultados para “${q}”`,
  semantic: "Inclui resultados por proximidade de sentido.",
  topicEyebrow: "Assunto",
  eventEyebrow: "Evento",
  loading: "Buscando…",
  emptyTitle: (q: string) => `Nenhum resultado para “${q}”`,
  didYouMean: "Você quis dizer",
  emptyText:
    "Confira a grafia, use menos palavras ou tire os filtros. A busca já ignora acentos e maiúsculas.",
  emptyWiden: "Buscar sem filtros",
  emptyAsk: "Perguntar à IA",
  emptyExplore: "Explorar assuntos",
  errorTitle: "A busca não respondeu agora",
  errorText:
    "Pode ser uma instabilidade passageira. Seu texto e os filtros continuam aqui; tente de novo em instantes.",
  retry: "Tentar de novo",
  startTitle: "O que você procura?",
  startText:
    "Busque por palavra, bairro, assunto ou evento. Não precisa de acento: “onibus cpa” encontra “ônibus” e “CPA”.",
  startTopics: "Assuntos em andamento",
} as const;
