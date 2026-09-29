import { z } from "zod";

/**
 * Agente `source_profiler` (painel de fontes): só editorias, localidade, alertas de qualidade e
 * seletores. Estrito de propósito: política de imagem, republicação, confiabilidade, fonte única e
 * frequência não existem no schema e são recusadas se o modelo as inventar (CLAUDE.md regra 5.6).
 */
export const SOURCE_QUALITY_FLAGS = [
  "caca_clique",
  "agregador",
  "paywall",
  "baixa_relevancia_local",
  "patrocinado",
  "sem_data",
] as const;

const selector = z.string().min(1).max(200);

export const sourceProfileSchema = z
  .object({
    categories: z.array(z.string().min(1).max(40)).max(5),
    locality: z.enum(["cuiaba", "varzea-grande", "mt", "nacional"]),
    localityConfidence: z.number().min(0).max(1),
    qualityFlags: z.array(z.enum(SOURCE_QUALITY_FLAGS)).max(6),
    /** Só para página sem feed; validado com `isSafeSelector` depois da IA. */
    pageSelectors: z
      .object({
        item: selector,
        link: selector,
        title: selector,
        date: selector.optional(),
      })
      .strict()
      .nullable(),
    rationale: z.string().min(1).max(400),
  })
  .strict();
export type SourceProfileOutput = z.infer<typeof sourceProfileSchema>;
