import { z } from "zod";

/** Agente `write` (etapas 11 e 12): rascunho normalizado com citações por parágrafo. */
export const WriteSchema = z.object({
  title: z.string().min(10).max(140),
  dek: z.string().min(10).max(240),
  /** Resumo em frases curtas (RESUMO POR IA). */
  summary: z.array(z.string().min(1).max(300)).min(1).max(4),
  body: z
    .array(
      z.object({
        text: z.string().min(1).max(1200),
        /** Ids dos itens (`fonte_externa`) que sustentam o parágrafo. */
        citations: z.array(z.string().min(1)).min(1),
      }),
    )
    .min(1)
    .max(12),
});
export type WriteOutput = z.infer<typeof WriteSchema>;
