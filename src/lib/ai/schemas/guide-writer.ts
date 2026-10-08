import { z } from "zod";

/**
 * Texto de abertura de uma lista do Guia e um comentário curto por lugar (A-214). Só com os dados
 * enviados (nome, bairro, nota, número de avaliações, posição): `checkArticle` confere de novo
 * nomes, números e frases proibidas antes de gravar.
 */
export const GuideWriterSchema = z
  .object({
    article: z.string().trim().min(400).max(4000),
    notes: z
      .array(
        z
          .object({
            id: z.string().trim().min(1).max(80),
            note: z.string().trim().min(30).max(300),
          })
          .strict(),
      )
      .max(20),
  })
  .strict();
export type GuideWriterOutput = z.infer<typeof GuideWriterSchema>;
