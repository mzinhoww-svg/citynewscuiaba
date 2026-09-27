import { z } from "zod";

const Claim = z.object({
  text: z.string().min(1).max(500),
  /** Índices em `sources` (spec §5.5). */
  citations: z.array(z.number().int().min(0)),
});

/**
 * Agente `answer` (busca com IA, spec §5.5): rascunho da resposta. `sources`, `confidence` e
 * `asOf` vêm do servidor, nunca do modelo; toda frase de `facts` precisa de citação.
 */
export const AnswerDraftSchema = z.object({
  facts: z.array(Claim.extend({ citations: Claim.shape.citations.min(1) })).max(12),
  inferences: z.array(Claim).max(6),
  gaps: z.array(z.string().min(1).max(300)).max(6),
  conflicts: z
    .array(
      z.object({
        topic: z.string().min(1).max(200),
        positions: z.array(Claim).min(2).max(6),
      }),
    )
    .max(4),
});
export type AnswerDraft = z.infer<typeof AnswerDraftSchema>;
