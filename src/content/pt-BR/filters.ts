/** Textos do painel de filtros recolhível (portal e Estúdio). */
export const FILTERS_TEXT = {
  label: "Filtros",
  active: (n: number) => (n === 1 ? "1 ativo" : `${n} ativos`),
  button: (n: number) => (n > 0 ? `Filtros, ${n === 1 ? "1 ativo" : `${n} ativos`}` : "Filtros"),
  clear: "Limpar filtros",
} as const;
