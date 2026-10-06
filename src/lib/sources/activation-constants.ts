/**
 * Constantes puras da ativação em lote (R43), sem zod. Os schemas ficam em `./activation`
 * (só servidor; item 85, A-154).
 */

export const BLOCK_REASONS = ["robots", "legal", "quality", "other"] as const;
export type BlockReason = (typeof BLOCK_REASONS)[number];
