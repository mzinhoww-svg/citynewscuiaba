import { describe, expect, it, vi } from "vitest";
import { venue } from "./testing";
import { needsArticle, writeDueArticles, type ArticleList } from "./write-step";

const v1 = venue({ name: "Bakehouse 44" });
const v2 = venue({ name: "Padaria América" });

const list = (over: Partial<ArticleList> = {}): ArticleList => ({
  id: "l1",
  slug: "padarias-cuiaba",
  title: "As 2 melhores padarias de Cuiabá",
  category: "padaria",
  hasIntro: false,
  introAuto: false,
  signature: null,
  attempts: 0,
  problems: [],
  items: [
    { position: 2, venue: v2 },
    { position: 1, venue: v1 },
  ],
  ...over,
});

describe("needsArticle", () => {
  it("lista sem texto, ou com texto do Guia e lugares novos, precisa de texto", () => {
    expect(needsArticle(list())).toBe(true);
    expect(needsArticle(list({ hasIntro: true, introAuto: true, signature: "x" }))).toBe(true);
  });
  it("texto do Guia com os mesmos lugares, texto do editor ou lista vazia não precisam", () => {
    const sig = `${v1.id},${v2.id}`;
    expect(needsArticle(list({ hasIntro: true, introAuto: true, signature: sig }))).toBe(false);
    expect(needsArticle(list({ hasIntro: true, introAuto: false, signature: null }))).toBe(false);
    expect(needsArticle(list({ items: [] }))).toBe(false);
  });
});

describe("writeDueArticles", () => {
  it("escreve na ordem da lista, grava com a assinatura e invalida as páginas", async () => {
    const write = vi.fn(async () => ({
      intro: "Texto.",
      notes: { [v1.id]: "Comentário." },
      source: "ai" as const,
      problems: [],
    }));
    const save = vi.fn(async () => {});
    const failed = vi.fn(async () => {});
    const revalidate = vi.fn<(tags: string[]) => Promise<void>>(async () => {});
    const out = await writeDueArticles({
      published: async () => [
        list(),
        list({ id: "l2", slug: "editor", hasIntro: true, introAuto: false }),
      ],
      write,
      save,
      failed,
      revalidate,
    });
    expect(out).toEqual([{ slug: "padarias-cuiaba", source: "ai", problems: 0 }]);
    expect((write.mock.calls[0] as unknown[])[1]).toEqual({ fallback: false, previous: [] });
    const input = (write.mock.calls[0] as unknown[])[0] as {
      noun: string;
      venues: { name: string }[];
    };
    expect(input.noun).toBe("padarias");
    expect(input.venues.map((v) => v.name)).toEqual(["Bakehouse 44", "Padaria América"]);
    expect(save).toHaveBeenCalledWith("l1", {
      intro: "Texto.",
      notes: { [v1.id]: "Comentário." },
      signature: `${v1.id},${v2.id}`,
    });
    expect(revalidate.mock.calls[0]![0]).toEqual(
      expect.arrayContaining(["guide:list:padarias-cuiaba", `guide:venue:${v1.slug}`]),
    );
  });

  it("reprovado guarda a rodada; na 3ª rodada pede o texto montado", async () => {
    const write = vi.fn(async () => ({ failed: true as const, problems: ["não cita X"] }));
    const failed = vi.fn(async () => {});
    const deps = {
      write,
      failed,
      save: vi.fn(async () => {}),
      revalidate: vi.fn(async () => {}),
    };
    const out = await writeDueArticles({
      ...deps,
      published: async () => [list({ attempts: 1, problems: ["antes"] })],
    });
    expect(out).toEqual([{ slug: "padarias-cuiaba", source: "retry", problems: 1, round: 2 }]);
    expect(failed).toHaveBeenCalledWith("l1", 2, ["não cita X"]);
    expect((write.mock.calls[0] as unknown[])[1]).toEqual({ fallback: false, previous: ["antes"] });

    await writeDueArticles({ ...deps, published: async () => [list({ attempts: 2 })] });
    expect((write.mock.calls[1] as unknown[])[1]).toMatchObject({ fallback: true });
  });
});
