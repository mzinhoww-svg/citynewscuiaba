import { z } from "zod";

/**
 * Agente `reviewer` (AUT-T6): decide o que fazer com a matéria que ficou em revisão e passou do
 * prazo. Publicar, manter para uma pessoa ou arquivar, sempre com a justificativa (gravada em
 * `decisions`). Nunca decide correção, direito de resposta, denúncia nem mudança de regra: esses
 * itens nem chegam ao agente.
 */
export const REVIEW_VERDICTS = ["publish", "hold", "archive"] as const;
export type ReviewVerdict = (typeof REVIEW_VERDICTS)[number];

export const ReviewSchema = z.object({
  verdict: z.enum(REVIEW_VERDICTS),
  reason: z.string().trim().min(10).max(500),
});
export type ReviewOutput = z.infer<typeof ReviewSchema>;
