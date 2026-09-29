import { describe, expect, it } from "vitest";
import {
  applyTitleTemplate,
  campaignInputSchema,
  SETTING_KEYS,
  validateSettings,
} from "./settings";

describe("validateSettings", () => {
  it("aceita valores válidos e apara espaços", () => {
    const r = validateSettings({
      "seo.title_template": "  {titulo} · CityNews Cuiabá ",
      "notify.max_push_per_day": " 3 ",
      "notify.quiet_start": "22:00",
    });
    expect(r).toEqual({
      ok: true,
      values: {
        "seo.title_template": "{titulo} · CityNews Cuiabá",
        "notify.max_push_per_day": "3",
        "notify.quiet_start": "22:00",
      },
    });
  });
  it("modelo de título sem {titulo}, hora inválida e limite fora da faixa dão erro por chave", () => {
    const r = validateSettings({
      "seo.title_template": "CityNews",
      "notify.quiet_end": "25:00",
      "notify.max_push_per_day": "11",
      "general.contact_email": "sem-arroba",
    });
    expect(r.ok).toBe(false);
    if (!r.ok)
      expect(Object.keys(r.errors).sort()).toEqual([
        "general.contact_email",
        "notify.max_push_per_day",
        "notify.quiet_end",
        "seo.title_template",
      ]);
  });
  it("chaves fora da lista permitida são ignoradas", () => {
    const r = validateSettings({ "seo.title_template": "{titulo}", "notify.quiet_end": "06:00" }, [
      "notify.quiet_end",
    ]);
    expect(r).toEqual({ ok: true, values: { "notify.quiet_end": "06:00" } });
  });
  it("a lista de chaves bate com a migration 0036", () => {
    expect([...SETTING_KEYS]).toHaveLength(7);
  });
  it("aplica o modelo de título", () => {
    expect(applyTitleTemplate("{titulo} · CityNews Cuiabá", "Ponte reabre")).toBe(
      "Ponte reabre · CityNews Cuiabá",
    );
  });
});

describe("campaignInputSchema", () => {
  const ok = {
    advertiser: "Anunciante Fictício",
    startsOn: "2026-10-01",
    endsOn: "2026-10-31",
    sections: ["cidade"],
    headline: "Peça de teste",
    url: "https://anunciante.example/oferta",
  };
  it("aceita campanha válida", () => expect(campaignInputSchema.safeParse(ok).success).toBe(true));
  it("recusa Política, fim antes do início e link sem https", () => {
    expect(campaignInputSchema.safeParse({ ...ok, sections: ["cidade", "politica"] }).success).toBe(
      false,
    );
    expect(campaignInputSchema.safeParse({ ...ok, endsOn: "2026-09-01" }).success).toBe(false);
    expect(campaignInputSchema.safeParse({ ...ok, url: "http://x.example" }).success).toBe(false);
  });
});
