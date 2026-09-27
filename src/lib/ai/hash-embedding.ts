import { hash64, textTokens } from "@/lib/pipeline/text-features";
import { embeddingDim } from "./config";

/**
 * Embedding determinístico do provedor falso (feature hashing com sinal, normalizado).
 * Textos quase idênticos ficam com cosseno perto de 1; assuntos sem palavras em comum, perto de 0.
 * Permite testar os limiares de dedupe (0,90) e cluster (0,82) sem chamar provedor.
 */
export function hashEmbedding(text: string, dim: number = embeddingDim()): number[] {
  const v = new Array<number>(dim).fill(0);
  const size = BigInt(dim);
  for (const token of textTokens(text)) {
    const h = hash64(token);
    const index = Number(h % size);
    v[index]! += (h >> 63n) & 1n ? -1 : 1;
  }
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  return norm === 0 ? v : v.map((x) => x / norm);
}
