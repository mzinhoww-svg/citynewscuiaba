import { z } from "zod";

/**
 * Agente `image` (etapa 13): decide se o tema permite imagem gerada e descreve a ilustração.
 * Nunca fotorrealista de pessoa real, nunca crime, tragédia ou saúde individual.
 */
export const ImageSchema = z.object({
  allowed: z.boolean(),
  reason: z.string().min(1).max(300),
  /** Descrição para o gerador (vazia quando não permitido). */
  prompt: z.string().max(600),
  alt: z.string().max(200),
});
export type ImageOutput = z.infer<typeof ImageSchema>;
