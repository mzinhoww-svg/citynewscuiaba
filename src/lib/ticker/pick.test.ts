import { describe, expect, it } from "vitest";
import { pickTickerItems, scopeOf, type TickerArticle } from "./pick";

const NOW = new Date("2026-10-03T15:00:00Z");
const ago = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

let n = 0;
const art = (over: Partial<TickerArticle> = {}): TickerArticle => {
  n += 1;
  return {
    id: `a${n}`,
    slug: `materia-${n}`,
    title: `Título ${n}`,
    publishedAt: ago(1),
    status: "published",
    topicId: null,
    newsScope: "cuiaba",
    ...over,
  };
};

describe("pickTickerItems", () => {
  it("ordena por escopo (cuiabá, mt, brasil, mundo) e, dentro dele, pelo mais recente", () => {
    const items = pickTickerItems(
      [
        art({ title: "Mundo", newsScope: "mundo", publishedAt: ago(0.1) }),
        art({ title: "Brasil", newsScope: "brasil", publishedAt: ago(0.2) }),
        art({ title: "MT", newsScope: "mt", publishedAt: ago(0.3) }),
        art({ title: "Cuiabá velha", newsScope: "cuiaba", publishedAt: ago(5) }),
        art({ title: "Cuiabá nova", newsScope: "cuiaba", publishedAt: ago(1) }),
      ],
      { now: NOW },
    );
    expect(items.map((i) => i.title)).toEqual([
      "Cuiabá nova",
      "Cuiabá velha",
      "MT",
      "Brasil",
      "Mundo",
    ]);
    expect(items[0]).toEqual({
      title: "Cuiabá nova",
      href: expect.stringMatching(/^\/materia\/materia-\d+$/),
      scope: "cuiaba",
    });
  });

  it("usa só matérias publicadas", () => {
    const items = pickTickerItems(
      [art({ title: "Rascunho", status: "draft" }), art({ title: "No ar", status: "updated" })],
      { now: NOW },
    );
    expect(items.map((i) => i.title)).toEqual(["No ar"]);
  });

  it("janela de 12 h; com menos de 5 itens estende para 24 h", () => {
    const few = [art({ publishedAt: ago(2) }), art({ publishedAt: ago(20) })];
    expect(pickTickerItems(few, { now: NOW })).toHaveLength(2);
    const many = [
      ...Array.from({ length: 5 }, () => art({ publishedAt: ago(3) })),
      art({ publishedAt: ago(20) }),
    ];
    expect(pickTickerItems(many, { now: NOW })).toHaveLength(5);
    expect(pickTickerItems([art({ publishedAt: ago(30) })], { now: NOW })).toEqual([]);
  });

  it("não exige slot de destaque nem imagem", () => {
    const items = pickTickerItems([art({ title: "Sem destaque" })], { now: NOW });
    expect(items).toHaveLength(1);
  });

  it("um item por assunto e sem título repetido", () => {
    const items = pickTickerItems(
      [
        art({ title: "A", topicId: "t1", publishedAt: ago(1) }),
        art({ title: "B", topicId: "t1", publishedAt: ago(2) }),
        art({ title: "  a  ", publishedAt: ago(3) }),
        art({ title: "C", topicId: "t2", publishedAt: ago(4) }),
      ],
      { now: NOW },
    );
    expect(items.map((i) => i.title)).toEqual(["A", "C"]);
  });

  it("garante ao menos 2/3 de itens de Cuiabá e MT quando houver", () => {
    const national = Array.from({ length: 10 }, (_, i) =>
      art({ title: `Nacional ${i}`, newsScope: "brasil", publishedAt: ago(0.1) }),
    );
    const local = Array.from({ length: 10 }, (_, i) =>
      art({ title: `Local ${i}`, newsScope: i % 2 ? "mt" : "cuiaba", publishedAt: ago(10) }),
    );
    const items = pickTickerItems([...national, ...local], { now: NOW, max: 12 });
    expect(items).toHaveLength(12);
    expect(
      items.filter((i) => i.scope === "cuiaba" || i.scope === "mt").length,
    ).toBeGreaterThanOrEqual(8);
  });

  it("respeita max e devolve vazio sem matérias", () => {
    const list = Array.from({ length: 20 }, () => art());
    expect(pickTickerItems(list, { now: NOW, max: 6 })).toHaveLength(6);
    expect(pickTickerItems([], { now: NOW })).toEqual([]);
  });
});

describe("scopeOf", () => {
  it("usa newsScope quando existe", () => {
    expect(
      scopeOf({ newsScope: "mundo", title: "Cuiabá", neighborhoods: [], sectionSlug: "cidade" }),
    ).toBe("mundo");
  });
  it("deriva de bairro, editoria e texto", () => {
    expect(scopeOf({ title: "x", neighborhoods: ["Coxipó"], sectionSlug: "politica" })).toBe(
      "cuiaba",
    );
    expect(scopeOf({ title: "x", neighborhoods: [], sectionSlug: "cidade" })).toBe("cuiaba");
    expect(
      scopeOf({ title: "Obra em Várzea Grande", neighborhoods: [], sectionSlug: "politica" }),
    ).toBe("cuiaba");
    expect(scopeOf({ title: "Safra de Sinop", neighborhoods: [], sectionSlug: "economia" })).toBe(
      "mt",
    );
    expect(
      scopeOf({ title: "Governo federal anuncia", neighborhoods: [], sectionSlug: "politica" }),
    ).toBe("brasil");
  });
});
