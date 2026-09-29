import { z } from "zod";
import { isSafeSelector } from "./page-list";

export const FAST_FREQUENCIES = [10, 15, 20] as const;

const normalGrid = (v: number): boolean =>
  Number.isInteger(v) && v >= 30 && v <= 1440 && v % 30 === 0;

/** Espelha o `check` de 0011: `null` (padrão), 10, 15, 20 ou múltiplo de 30 entre 30 e 1440. */
export const frequencySchema = z
  .number()
  .nullable()
  .refine(
    (v) => v === null || (FAST_FREQUENCIES as readonly number[]).includes(v) || normalGrid(v),
    {
      message: "Escolha 10, 15 ou 20 minutos, ou um múltiplo de 30 minutos até 24 horas.",
    },
  );

/** Padrão global: só o ciclo normal. */
export const defaultFrequencySchema = z.number().refine(normalGrid, {
  message: "O padrão precisa ser múltiplo de 30 minutos, de 30 minutos a 24 horas.",
});

export const fastLaneMaxSchema = z
  .number()
  .int("Informe um número inteiro.")
  .min(0, "O mínimo é 0 vaga.")
  .max(20, "O máximo é 20 vagas.");

const selector = z
  .string()
  .refine(isSafeSelector, { message: "Seletor inválido ou não permitido." });

export const pageSelectorsSchema = z
  .object({ item: selector, link: selector, title: selector, date: selector.optional() })
  .strict();

const uuid = z.string().uuid("Identificador inválido.");

export const sourceConfigSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome da fonte.").max(120, "Use até 120 caracteres."),
  displayName: z
    .string()
    .trim()
    .min(1)
    .max(60, "O nome exibido pode ter até 60 caracteres.")
    .nullable(),
  ownerId: uuid.nullable(),
  layer: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).nullable(),
  categories: z.array(z.string().trim().min(1).max(60)).max(6, "Escolha até 6 editorias."),
  locality: z.enum(["cuiaba", "varzea-grande", "mt", "nacional"], {
    message: "Escolha uma localidade da lista.",
  }),
  reliability: z.enum(["primary", "verified", "standard", "low"], {
    message: "Escolha a confiabilidade.",
  }),
  imagePolicy: z.enum(["none", "with_agreement", "licensed_only", "reproduction"], {
    message: "Escolha a política de imagem.",
  }),
  republishPolicy: z.enum(["link_only", "summary_2_sentences"], {
    message: "Escolha a política de republicação.",
  }),
  maySoleSource: z.boolean(),
  agreementUntil: z.string().nullable(),
  agreementNote: z.string().max(500, "Use até 500 caracteres.").nullable(),
  termsUrl: z
    .url({ protocol: /^https?$/, message: "Informe um endereço http ou https válido." })
    .max(2048)
    .nullable(),
  termsMinIntervalMinutes: z.number().int().min(1).max(1440).nullable(),
  frequencyMinutes: frequencySchema,
  rateLimitPerHour: z
    .number()
    .int("Informe um número inteiro.")
    .min(1, "Use de 1 a 120 requisições por hora.")
    .max(120, "Use de 1 a 120 requisições por hora."),
  editorialScore: z.number().int().min(1, "O score vai de 1 a 5.").max(5, "O score vai de 1 a 5."),
  priority: z.union([z.literal(1), z.literal(2), z.literal(3)], {
    message: "Escolha Alta, Normal ou Baixa.",
  }),
});

export const consumptionSchema = z.object({
  strategy: z.enum(["rss", "atom", "jsonfeed", "sitemap_news", "page_list", "page_article"], {
    message: "Estratégia de coleta desconhecida.",
  }),
  feedUrl: z
    .url({ protocol: /^https?$/ })
    .nullable()
    .optional(),
  alternates: z
    .array(z.url({ protocol: /^https?$/ }))
    .max(10)
    .optional(),
  page: pageSelectorsSchema.optional(),
  discovery: z
    .object({
      at: z.string(),
      by: z.enum(["auto", "human"]),
      inputUrl: z.string(),
      tried: z.number().int().min(0),
    })
    .optional(),
  robots: z
    .object({
      checkedAt: z.string(),
      allowed: z.boolean(),
      crawlDelaySec: z.number().min(0).nullable(),
    })
    .optional(),
  cadence: z
    .object({
      itemsPerDay: z.number().min(0),
      medianGapMinutes: z.number().min(0).nullable(),
      sampledAt: z.string(),
    })
    .optional(),
});

export type ConsumptionConfig = z.infer<typeof consumptionSchema>;
