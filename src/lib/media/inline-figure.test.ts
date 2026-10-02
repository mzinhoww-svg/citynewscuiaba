import { describe, expect, it } from "vitest";
import type { ArticleBlock } from "@/lib/db/queries/types";
import { withInlineFigure } from "./inline-figure";

const p = (text: string): ArticleBlock => ({ type: "paragraph", text });
const h: ArticleBlock = { type: "heading", level: 2, text: "Intertítulo" };
const after = (body: ArticleBlock[], pos: number | undefined) =>
  withInlineFigure(body, pos).flatMap((x) => (x.figureAfter ? [x.i] : []));

describe("withInlineFigure", () => {
  it("entra depois do parágrafo 3, contando só parágrafos", () => {
    expect(after([p("1"), p("2"), p("3"), p("4")], 3)).toEqual([2]);
    expect(after([p("1"), h, p("2"), p("3"), p("4")], 3)).toEqual([3]);
  });
  it("corpo de 3 parágrafos com posição 2; corpo mais curto que a posição não leva figura", () => {
    expect(after([p("1"), p("2"), p("3")], 2)).toEqual([1]);
    expect(after([p("1")], 2)).toEqual([]);
    expect(after([p("1"), p("2")], 3)).toEqual([]);
  });
  it("sem posição (sem imagem no texto) nada entra; nunca antes do lide", () => {
    expect(after([p("1"), p("2")], undefined)).toEqual([]);
    expect(after([p("1"), p("2"), p("3")], 0)).toEqual([]);
  });
});
