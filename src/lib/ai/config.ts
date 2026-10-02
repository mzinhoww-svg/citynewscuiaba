/** Configuração da camada de IA lida do ambiente, sempre de forma preguiçosa (nada lança no import). */

export const DEFAULT_EMBEDDING_DIM = 1536;
export const DEFAULT_EMBEDDING_MODEL = "openai/text-embedding-3-small";

/** Dimensão dos embeddings (`EMBEDDING_DIM`, padrão 1536 do text-embedding-3-small). */
export function embeddingDim(): number {
  const n = Number(process.env.EMBEDDING_DIM);
  return Number.isInteger(n) && n > 0 && n <= 16000 ? n : DEFAULT_EMBEDDING_DIM;
}
