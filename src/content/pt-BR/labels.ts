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

/** O que cada rótulo quer dizer, em linguagem simples ("Como esta matéria foi feita"). */
export const LABEL_EXPLAIN: Record<LabelKind, string> = {
  original: "Reportagem apurada e escrita pela redação do CityNews.",
  normalized:
    "Texto próprio do CityNews a partir de informações publicadas por outras fontes, todas citadas abaixo.",
  aggregated: "Conteúdo de outro veículo. O CityNews mostra só o título e o link para o original.",
  ai_summary: "O resumo foi escrito por IA a partir do texto da matéria e conferido pela redação.",
  auto_published:
    "Publicado pelo motor do CityNews dentro das regras de autonomia, sem revisão prévia. Um editor pode corrigir ou despublicar.",
  human_reviewed: "Uma pessoa da redação revisou o texto antes da publicação.",
  image_original: "Foto feita pela equipe do CityNews ou cedida com autorização.",
  image_reproduction:
    "Imagem reproduzida da fonte original, com crédito e link. Sai do ar em até 24 h a pedido do veículo.",
  image_licensed: "Imagem de banco de imagens, usada com licença.",
  image_illustrative: "Imagem ilustrativa: não mostra o fato noticiado.",
  image_ai: "Imagem gerada por IA para ilustrar. Nunca retrata pessoa real.",
  sponsored: "Conteúdo pago por um anunciante e identificado como tal.",
};
