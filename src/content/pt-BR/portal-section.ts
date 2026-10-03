/*
 * Textos do portal público (P1), parte "section". `portal.ts` reexporta tudo; os componentes do
 * navegador importam daqui para levar só o que usam (B-018).
 */

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
  origins: { all: "Todas", original: "Original CityNews", normalized: "Feito a partir de fontes" },
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
