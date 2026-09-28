import { z } from "zod";

/**
 * Agente `source_profiler` (Painel de Fontes, spec §7.1 passo 9, migration 0011): sugestões a
 * partir só de metadados (títulos, datas, host, `og:site_name`, meta description, esqueleto de
 * página). Nunca opina sobre política de imagem, republicação, confiabilidade, fonte única ou
 * frequência — decisões humanas (D-F11, D-F12).
 */

export const QUALITY_FLAGS = [
  "caca_clique",
  "agregador",
  "paywall",
  "baixa_relevancia_local",
  "patrocinado",
  "sem_data",
] as const;
export type QualityFlag = (typeof QUALITY_FLAGS)[number];

/** Mesma régua de `Locality` (`src/lib/sources/types.ts`), repetida aqui para não depender dele. */
export const SOURCE_PROFILE_LOCALITIES = ["cuiaba", "varzea-grande", "mt", "nacional"] as const;
export type SourceProfileLocality = (typeof SOURCE_PROFILE_LOCALITIES)[number];

/** Seletores CSS sugeridos para uma página sem feed (validados de novo em `profile.ts`). */
const suggestedPageSelectorsSchema = z
  .object({
    item: z.string().min(1).max(200),
    link: z.string().min(1).max(200),
    title: z.string().min(1).max(200),
    date: z.string().min(1).max(200).optional(),
  })
  .strict();

/** Saída estrita do agente: nada além destes campos (Review Focus 5, D-F12). */
export const sourceProfileSchema = z
  .object({
    categories: z.array(z.string().min(1).max(60)).max(5),
    locality: z.enum(SOURCE_PROFILE_LOCALITIES),
    localityConfidence: z.number().min(0).max(1),
    qualityFlags: z.array(z.enum(QUALITY_FLAGS)),
    pageSelectors: suggestedPageSelectorsSchema.nullable(),
    rationale: z.string().min(1).max(400),
  })
  .strict();
export type SourceProfileOutput = z.infer<typeof sourceProfileSchema>;
