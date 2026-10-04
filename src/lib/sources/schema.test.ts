import { consumptionSchema } from "./schema";

describe("consumptionSchema.enrich", () => {
  it("é opcional e desligado por padrão", () => {
    const r = consumptionSchema.parse({ strategy: "sitemap_news" });
    expect(r.enrich).toBeUndefined();
  });

  it("aceita enrich booleano e recusa outro tipo", () => {
    expect(consumptionSchema.parse({ strategy: "sitemap_news", enrich: true }).enrich).toBe(true);
    expect(consumptionSchema.safeParse({ strategy: "sitemap_news", enrich: "sim" }).success).toBe(
      false,
    );
  });
});

describe("consumptionSchema.frontpage", () => {
  it("é opcional (ausente = desligado) e só aceita booleano", () => {
    expect(consumptionSchema.parse({ strategy: "rss" }).frontpage).toBeUndefined();
    expect(consumptionSchema.parse({ strategy: "rss", frontpage: true }).frontpage).toBe(true);
    expect(consumptionSchema.safeParse({ strategy: "rss", frontpage: "sim" }).success).toBe(false);
  });
});
