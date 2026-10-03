import type { ArticleBlock } from "@/lib/db/queries/types";

/**
 * Blocos do corpo com a marca de onde entra a imagem do texto: depois do parágrafo `position`
 * (contado só entre parágrafos, a partir de 1), nunca antes do lide. Corpo menor que a posição
 * pedida: a figura não entra (sem imagem solta no fim).
 */
export function withInlineFigure(
  body: ArticleBlock[],
  position: number | undefined,
): { b: ArticleBlock; i: number; figureAfter: boolean }[] {
  let paragraphs = 0;
  return body.map((b, i) => {
    if (b.type === "paragraph") paragraphs++;
    return {
      b,
      i,
      figureAfter: b.type === "paragraph" && position !== undefined && paragraphs === position,
    };
  });
}
