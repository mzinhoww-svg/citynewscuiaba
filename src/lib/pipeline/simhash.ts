import { hash64, textTokens } from "./text-features";

/**
 * Simhash de 64 bits (Charikar) sobre palavras e pares de palavras normalizados.
 * Textos que diferem em caixa, acento ou pontuação têm o mesmo simhash.
 */
export function simhash64(text: string): bigint {
  const words = textTokens(text);
  const features = [...words, ...words.slice(1).map((w, i) => `${words[i]} ${w}`)];
  const weights = new Array<number>(64).fill(0);
  for (const f of features) {
    const h = hash64(f);
    for (let bit = 0; bit < 64; bit++) weights[bit]! += (h >> BigInt(bit)) & 1n ? 1 : -1;
  }
  let out = 0n;
  for (let bit = 0; bit < 64; bit++) if (weights[bit]! > 0) out |= 1n << BigInt(bit);
  return out;
}

/** Distância de Hamming entre dois inteiros de 64 bits (com ou sem sinal). */
export function hamming(a: bigint, b: bigint): number {
  let x = BigInt.asUintN(64, a ^ b);
  let n = 0;
  while (x) {
    x &= x - 1n;
    n++;
  }
  return n;
}

/** `bigint` do Postgres é com sinal: guarda o simhash como inteiro de 64 bits com sinal. */
export const toSigned64 = (h: bigint): bigint => BigInt.asIntN(64, h);
export const toUnsigned64 = (h: bigint): bigint => BigInt.asUintN(64, h);
