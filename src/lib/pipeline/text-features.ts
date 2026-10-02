/**
 * Tokens para impressões digitais de texto (simhash, embedding do provedor falso): sem acento,
 * minúsculos, só letras e números. "Ônibus do CPA!" e "onibus do cpa" geram os mesmos tokens.
 */
export function textTokens(text: string): string[] {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length > 0);
}

const FNV_OFFSET = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const MASK = (1n << 64n) - 1n;
const encoder = new TextEncoder();

/** FNV-1a de 64 bits seguido do finalizador do splitmix64 (espalha bem os bits). */
export function hash64(s: string): bigint {
  let h = FNV_OFFSET;
  for (const byte of encoder.encode(s)) {
    h ^= BigInt(byte);
    h = (h * FNV_PRIME) & MASK;
  }
  h = ((h ^ (h >> 30n)) * 0xbf58476d1ce4e5b9n) & MASK;
  h = ((h ^ (h >> 27n)) * 0x94d049bb133111ebn) & MASK;
  return h ^ (h >> 31n);
}
