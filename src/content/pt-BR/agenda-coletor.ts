/** Frases próprias da descrição dos eventos coletados (nunca o texto da fonte). */
export const COLLECTED_DESCRIPTION = {
  /** "Música em Casa Cerrado Vivo, Porto, sábado, 17 de outubro de 2026, às 20h." */
  where: (category: string, place: string, when: string, hour: string) =>
    `${category} em ${place}, ${when}, às ${hour}.`,
  free: "Entrada gratuita.",
  from: (price: string) => `Ingresso a partir de ${price}.`,
  unknownPrice: "Consulte o valor e a programação completa no site da organização.",
} as const;
