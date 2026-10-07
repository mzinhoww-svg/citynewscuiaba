/**
 * Fontes em destaque (P14): textos da lista e nomes das categorias. Módulo próprio: a parte
 * cliente da lista não leva ao navegador os textos da página de uma fonte nem do Panorama
 * (item 86, A-156).
 */

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
