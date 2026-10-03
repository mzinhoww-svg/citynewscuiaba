import { z } from "zod";

/** Editorias do portal (tabela `sections`). */
export const SECTION_SLUGS = [
  "cidade",
  "politica",
  "economia",
  "cultura",
  "esportes",
  "entretenimento",
  "gastronomia",
  "servicos",
  "guia-cuiaba",
  "seguranca",
  "saude",
  "agenda",
  "clima",
] as const;
export type SectionSlug = (typeof SECTION_SLUGS)[number];

/** Agente `classify` (etapa 8): editoria, relevância local e sensibilidade do item. */
export const ClassifySchema = z.object({
  section: z.enum(SECTION_SLUGS),
  /** Relevância para o leitor de Cuiabá e Várzea Grande, de 0 a 1. */
  relevance: z.number().min(0).max(1),
  /** Tema sensível (crime, tragédia, saúde individual, eleições…): nunca publica sozinho. */
  sensitive: z.boolean(),
  tags: z.array(z.string().min(1).max(40)).max(8),
  /** Notícia nacional de comoção (tragédia, luto, evento histórico): única que pode ser urgente ou destaque fora de Cuiabá e MT. */
  nationalCommotion: z.boolean().optional(),
});
export type Classification = z.infer<typeof ClassifySchema>;
