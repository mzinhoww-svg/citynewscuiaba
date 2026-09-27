import { z } from "zod";

/** Agente `locate` (etapa 9): usado só quando o dicionário de bairros não resolve. */
export const LocateSchema = z.object({
  municipality: z.enum(["cuiaba", "varzea-grande", "mt", "nacional"]).nullable(),
  /** Nome do bairro como aparece no texto; validado contra o dicionário. */
  neighborhood: z.string().min(1).max(80).nullable(),
  confidence: z.number().min(0).max(1),
});
export type LocateOutput = z.infer<typeof LocateSchema>;
