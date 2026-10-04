import { z } from "zod";

/**
 * Saída validada da extração de uma lista colada por link (GUIA-T4, spec G7). Só nomes de
 * lugares, a categoria, o tipo de critério (vocabulário fechado, nunca uma frase do original) e
 * observações curtas sobre a lista. Nada de texto copiado: o texto do portal é dado, nunca
 * instrução, e o que sai daqui é conferido de novo nos provedores.
 */

export const CRITERIA_KINDS = [
  "avaliacoes de clientes",
  "votacao popular",
  "escolha da redacao",
  "ranking de plataformas",
] as const;
export type CriteriaKind = (typeof CRITERIA_KINDS)[number];

export const guideExtractSchema = z
  .object({
    names: z.array(z.string().trim().min(2).max(120)).min(1).max(40),
    category: z.string().trim().min(2).max(40).nullable(),
    criteria: z.enum(CRITERIA_KINDS).nullable(),
    notes: z.array(z.string().trim().min(1).max(200)).max(10),
  })
  .strict();
export type GuideExtract = z.infer<typeof guideExtractSchema>;
