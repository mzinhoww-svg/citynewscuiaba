/** Arredonda para 2 casas, meio para cima, compensando erro de ponto flutuante (0,645 → 0,65). */
export function round2(x: number): number {
  return Math.round((x + Number.EPSILON) * 100) / 100;
}
