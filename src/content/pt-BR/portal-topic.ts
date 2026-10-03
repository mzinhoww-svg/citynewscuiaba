/*
 * Textos do portal público (P1), parte "topic". `portal.ts` reexporta tudo; os componentes do
 * navegador importam daqui para levar só o que usam (B-018).
 */

/** Assunto (P05) e lista de assuntos (P06). */
export const TOPIC = {
  metaTitle: (t: string) => `${t} · Assunto · CityNews Cuiabá`,
  eyebrow: "Assunto",
  counts: (articles: number, sources: number) =>
    `${articles === 1 ? "1 matéria do CityNews" : `${articles} matérias do CityNews`} · ${sources === 1 ? "1 veículo" : `${sources} veículos`}`,
  updated: (when: string) => `atualizado ${when}`,
  summaryTitle: "O que se sabe",
  filterLabel: "Mostrar",
  filterOrigin: { all: "Tudo", citynews: "Do CityNews", external: "Outros veículos" },
  filterSource: "Veículo",
  allSources: "Todos os veículos",
  fromCityNews: "Do CityNews",
  external: "Cobertura de outros veículos",
  externalNotice:
    "Links para matérias de outros veículos. O CityNews não republica esses textos: eles abrem no site de origem.",
  timeline: "Linha do tempo",
  timelineCityNews: "CityNews",
  faq: "Perguntas frequentes",
  errorTitle: "Não conseguimos carregar este assunto agora",
  listTitle: "Assuntos",
  listIntro:
    "Os fatos que o CityNews acompanha, com o que já foi confirmado, o que diverge entre as fontes e o que falta apurar.",
  listMeta: "Assuntos · CityNews Cuiabá",
  listFilters: "Filtrar assuntos",
  listAll: "Todos",
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
