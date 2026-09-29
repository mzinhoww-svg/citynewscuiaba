/**
 * Testes A/B da recomendação (spec §7; plano P5 Task 7). Funções puras: a variante de um leitor
 * sai do id anônimo e do id do experimento, sem estado e sem dado pessoal.
 */

const EPS = 0.001;

/** Divisão válida: 2 a 6 partes, cada uma em (0, 1], somando 1 ±0,001. */
export function splitValid(split: readonly number[]): boolean {
  if (split.length < 2 || split.length > 6) return false;
  if (!split.every((p) => Number.isFinite(p) && p > 0 && p <= 1)) return false;
  return Math.abs(split.reduce((a, p) => a + p, 0) - 1) <= EPS;
}

/** FNV-1a de 32 bits com mistura final (avalanche), estável entre execuções e plataformas. */
function hash32(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * Variante (índice em `split`) do leitor no experimento. Mesmo id + mesmo experimento = mesma
 * variante, sempre; experimentos diferentes sorteiam de forma independente. Divisão inválida
 * devolve 0 (controle): o leitor nunca fica sem variante.
 */
export function assignVariant(anonId: string, exp: { id: string; split: number[] }): number {
  if (!splitValid(exp.split)) return 0;
  const point = hash32(`${exp.id}:${anonId}`) / 2 ** 32;
  let acc = 0;
  for (let i = 0; i < exp.split.length; i++) {
    acc += exp.split[i]!;
    if (point < acc) return i;
  }
  return exp.split.length - 1;
}
