import { z } from "zod";

/**
 * Agente `verify` (etapa 10): fato principal do assunto, papel de cada item e conflito central
 * (divergência de número, data ou local no fato principal). O conflito só vale se a regra de
 * extração confirmar os valores nos textos (`src/lib/pipeline/steps/verify.ts`).
 */
export const VerifySchema = z.object({
  mainFact: z.string().min(1).max(400),
  roles: z
    .array(
      z.object({
        id: z.string().min(1),
        role: z.enum(["primary", "secondary", "context"]),
      }),
    )
    .max(50),
  conflict: z
    .object({
      kind: z.enum(["number", "date", "place"]),
      description: z.string().min(1).max(300),
      positions: z
        .array(z.object({ id: z.string().min(1), value: z.string().min(1).max(120) }))
        .min(2)
        .max(10),
    })
    .nullable(),
  /** Conteúdo extremamente duvidoso (fato que não se sustenta, texto incoerente). */
  dubious: z.boolean().optional(),
  /** Não há como atribuir o fato principal a nenhuma das fontes. */
  unattributable: z.boolean().optional(),
});
export type VerifyOutput = z.infer<typeof VerifySchema>;
