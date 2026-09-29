import {
  FAST_FREQUENCIES,
  consumptionSchema,
  fastLaneMaxSchema,
  pageSelectorsSchema,
  sourceConfigSchema,
} from "./schema";

const valid = {
  name: "Folha do Cerrado",
  displayName: null,
  ownerId: null,
  layer: 2,
  categories: ["cidades"],
  locality: "cuiaba",
  reliability: "standard",
  imagePolicy: "none",
  republishPolicy: "link_only",
  maySoleSource: false,
  agreementUntil: null,
  agreementNote: null,
  termsUrl: null,
  termsMinIntervalMinutes: null,
  frequencyMinutes: null,
  rateLimitPerHour: 60,
  editorialScore: 3,
  priority: 2,
};

describe("sourceConfigSchema", () => {
  it("aceita o válido", () => expect(sourceConfigSchema.safeParse(valid).success).toBe(true));
  it("recusa fora dos limites, com mensagem em pt-BR", () => {
    for (const patch of [
      { editorialScore: 0 },
      { editorialScore: 6 },
      { priority: 4 },
      { rateLimitPerHour: 0 },
      { rateLimitPerHour: 121 },
      { displayName: "a".repeat(61) },
      { locality: "sp" },
      { categories: Array(7).fill("x") },
      { frequencyMinutes: 25 },
      { imagePolicy: "any" },
      { layer: 5 },
      { name: "" },
    ]) {
      const r = sourceConfigSchema.safeParse({ ...valid, ...patch });
      expect(r.success).toBe(false);
    }
    const r = sourceConfigSchema.safeParse({ ...valid, editorialScore: 9 });
    expect(!r.success && r.error.issues[0]?.message).toMatch(/1 a 5/);
  });
  it("frequência da via rápida", () => {
    expect(FAST_FREQUENCIES).toEqual([10, 15, 20]);
    expect(sourceConfigSchema.safeParse({ ...valid, frequencyMinutes: 15 }).success).toBe(true);
  });
  it("vagas da via rápida 0 a 20", () => {
    expect(fastLaneMaxSchema.safeParse(0).success).toBe(true);
    expect(fastLaneMaxSchema.safeParse(20).success).toBe(true);
    expect(fastLaneMaxSchema.safeParse(21).success).toBe(false);
    expect(fastLaneMaxSchema.safeParse(1.5).success).toBe(false);
  });
});

describe("consumptionSchema e seletores", () => {
  it("aceita o exemplo da spec", () => {
    const r = consumptionSchema.safeParse({
      strategy: "page_list",
      feedUrl: null,
      alternates: [],
      page: { item: "article.card", link: "a", title: "h2", date: "time" },
      robots: { checkedAt: "2026-09-27T14:00:00Z", allowed: true, crawlDelaySec: null },
    });
    expect(r.success).toBe(true);
  });
  it("recusa estratégia desconhecida e seletor perigoso", () => {
    expect(consumptionSchema.safeParse({ strategy: "scrape" }).success).toBe(false);
    expect(pageSelectorsSchema.safeParse({ item: "<b>", link: "a", title: "h2" }).success).toBe(
      false,
    );
    expect(
      pageSelectorsSchema.safeParse({ item: "li", link: "a", title: "h2", extra: 1 }).success,
    ).toBe(false);
  });
});
