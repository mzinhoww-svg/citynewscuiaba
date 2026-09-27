import type { LabelKind } from "@/lib/labels";

/** Textos dos rótulos de origem (DESIGN.md §5). Caixa alta por serem eyebrows. */
export const LABEL_TEXT: Record<LabelKind, string> = {
  original: "ORIGINAL CITYNEWS",
  normalized: "NORMALIZADO PELO CITYNEWS",
  aggregated: "AGREGADO",
  ai_summary: "RESUMO POR IA",
  auto_published: "PUBLICADO AUTOMATICAMENTE",
  human_reviewed: "REVISADO POR HUMANO",
  image_original: "FOTO ORIGINAL",
  image_reproduction: "REPRODUÇÃO",
  image_licensed: "IMAGEM LICENCIADA",
  image_illustrative: "IMAGEM ILUSTRATIVA",
  image_ai: "IMAGEM GERADA POR IA",
  sponsored: "PATROCINADO",
};

/** Detalhe do rótulo NORMALIZADO: "1 fonte", "7 fontes". */
export function sourceCountText(n: number): string {
  return n === 1 ? "1 fonte" : `${n} fontes`;
}

/** Separador de metadados. */
export const META_SEPARATOR = " · ";
