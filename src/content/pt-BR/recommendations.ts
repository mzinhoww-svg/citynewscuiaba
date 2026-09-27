/**
 * Justificativas de recomendação (textos fixos, spec §7.4) e motivos para ocultar.
 * Linguagem probabilística e sem o verbo "gostar"; nenhum atributo sensível (CLAUDE.md §5 regra 7).
 */
export const REASON_TEXT = {
  local_popular: "Popular em Cuiabá",
  regional_popular: "Popular entre leitores da sua região",
  topic: (topic: string) => `Recomendado porque você acompanha ${topic}`,
  local_follow: "Porque você acompanha notícias de Cuiabá",
  recent_visit: "Você acessou este veículo recentemente",
  trending: "Em alta nesta semana",
  similar: "Fonte semelhante às que você lê",
  recent_search: "Fonte nova sobre um tema que você pesquisou",
  followed: "Veículo seguido por você",
  diversity: "Recomendado para ampliar a diversidade de fontes",
  new: "Nova recomendação",
} as const;

/** Motivos para ocultar (spec §7.4). O último desliga a personalização. */
export const DISMISS_REASON_TEXT = {
  not_interested: "Não tenho interesse",
  already_know: "Já conheço esta fonte",
  hide_topic: "Não quero ver este tema",
  no_personalization: "Não quero recomendações personalizadas",
} as const;
