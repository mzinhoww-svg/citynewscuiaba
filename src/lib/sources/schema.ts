/**
 * Validação zod do domínio de fontes (spec §7.2, D-F14/D-F15). `frequencySchema` espelha o
 * `check` de `sources.frequency_minutes` em `supabase/migrations/0011_source_admin.sql`.
 * Só servidor: zod fora do JavaScript do navegador (item 85, A-156).
 */
import "server-only";
import { z } from "zod";
import { FAST_FREQUENCIES, isNormalGridValue } from "./schema-constants";

// Constantes puras em módulo próprio (o navegador importa de lá, sem zod; item 85).
export { FAST_FREQUENCIES } from "./schema-constants";

/** `null` (padrão global), 10/15/20 (via rápida) ou múltiplo de 30 entre 30 e 1440. */
export const frequencySchema = z
  .number()
  .int()
  .nullable()
  .refine(
    (v) =>
      v === null || (FAST_FREQUENCIES as readonly number[]).includes(v) || isNormalGridValue(v),
    {
      message:
        "Frequência inválida: use 10, 15 ou 20 minutos, ou um múltiplo de 30 entre 30 e 1440.",
    },
  );

/** Padrão global (`app_settings`): só a grade do ciclo normal, a via rápida nunca é padrão. */
export const defaultFrequencySchema = z.number().int().refine(isNormalGridValue, {
  message: "O padrão global aceita só múltiplos de 30 minutos, de 30 a 1440.",
});

/** Vagas da via rápida (`sources.fast_lane_max`): de 0 a 20. */
export const fastLaneMaxSchema = z
  .number()
  .int("Vagas da via rápida: um número inteiro.")
  .min(0, "Vagas da via rápida: de 0 a 20.")
  .max(20, "Vagas da via rápida: de 0 a 20.");

export const pageSelectorsSchema = z.object({
  item: z.string().min(1, "Seletor do item é obrigatório."),
  link: z.string().min(1, "Seletor do link é obrigatório."),
  title: z.string().min(1, "Seletor do título é obrigatório."),
  date: z.string().min(1).optional(),
});

export const consumptionSchema = z.object({
  strategy: z.enum(["rss", "atom", "jsonfeed", "sitemap_news", "page_list", "page_article"]),
  feedUrl: z.string().url().nullable().optional(),
  pageSelectors: pageSelectorsSchema.nullable().optional(),
  /**
   * Enriquecimento por página (og:title, og:image, data, lead) só dos itens novos, passo `enrich`
   * entre `normalize` e `dedupe`. Desligado por padrão; fonte sem a flag nunca paga a requisição.
   */
  enrich: z.boolean().optional(),
  /**
   * Leitura do topo da página inicial (passo `frontpage`, HOT-T2, a cada 20 min): só URL e posição
   * dos 3 primeiros links de matéria, para a pauta quente. Desligado por padrão (ausente = falso).
   */
  frontpage: z.boolean().optional(),
  robots: z
    .object({
      crawlDelaySec: z.number().int().nonnegative().nullable(),
    })
    .partial()
    .optional(),
});

const LOCALITIES = ["cuiaba", "varzea-grande", "mt", "nacional"] as const;

/** Formulário de edição (§7.2). Campos operacionais (last_fetched_at etc.) ficam fora. */
export const sourceConfigSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório."),
  displayName: z.string().max(60, "Nome de exibição: até 60 caracteres.").nullable(),
  slug: z.string().min(1, "Slug é obrigatório."),
  layer: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).nullable(),
  categories: z.array(z.string().min(1)).max(6, "No máximo 6 editorias."),
  locality: z.enum(LOCALITIES, { message: "Localidade inválida." }),
  reliability: z.enum(["low", "standard", "verified", "primary"]),
  imagePolicy: z.enum(["none", "licensed_only", "with_agreement", "reproduction"]),
  republishPolicy: z.enum(["link_only", "summary_2_sentences"]),
  maySoleSource: z.boolean(),
  trusted: z.boolean(),
  agreementUntil: z.string().nullable(),
  agreementNote: z.string().nullable(),
  termsUrl: z.string().nullable(),
  strategy: z.enum(["rss", "atom", "jsonfeed", "sitemap_news", "page_list", "page_article"]),
  baseUrl: z.string().min(1, "Endereço é obrigatório."),
  feedUrl: z.string().nullable(),
  pageSelectors: pageSelectorsSchema.nullable(),
  frequencyMinutes: frequencySchema,
  rateLimitPerHour: z
    .number()
    .int()
    .min(1, "Limite por hora: de 1 a 120.")
    .max(120, "Limite por hora: de 1 a 120."),
  termsMinIntervalMinutes: z.number().int().min(1).max(1440).nullable(),
  editorialScore: z
    .number()
    .int()
    .min(1, "Score editorial: de 1 a 5.")
    .max(5, "Score editorial: de 1 a 5."),
  priority: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  recPinned: z.boolean(),
  recLocalHighlight: z.boolean(),
  recExcluded: z.boolean(),
});

export type SourceConfigInput = z.infer<typeof sourceConfigSchema>;
