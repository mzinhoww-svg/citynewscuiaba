import { describe, expect, it } from "vitest";
import { idOf, kindOfStrategy, parseConfigFields, parseSourceExtras, versionOf } from "./form";

const form = (entries: [string, string][]) => {
  const f = new FormData();
  for (const [k, v] of entries) f.append(k, v);
  return f;
};

describe("parseConfigFields", () => {
  it("só entra o que veio no formulário", () => {
    const r = parseConfigFields(form([["editorialScore", "4"]]));
    expect(r).toEqual({ patch: { editorialScore: 4 }, fieldErrors: {} });
  });
  it("vazio vira null nos opcionais; frequência vazia ou default segue o padrão", () => {
    const r = parseConfigFields(
      form([
        ["displayName", "  "],
        ["frequencyMinutes", "default"],
        ["layer", ""],
        ["termsMinIntervalMinutes", ""],
      ]),
    );
    expect(r.patch).toEqual({
      displayName: null,
      frequencyMinutes: null,
      layer: null,
      termsMinIntervalMinutes: null,
    });
  });
  it("frequência: 10, 15, 20 e múltiplos de 30 passam; 5, 25 e 45 não", () => {
    for (const v of ["10", "15", "20", "30", "120", "1440"])
      expect(parseConfigFields(form([["frequencyMinutes", v]])).patch.frequencyMinutes).toBe(
        Number(v),
      );
    for (const v of ["5", "25", "45", "1470"]) {
      const r = parseConfigFields(form([["frequencyMinutes", v]]));
      expect(r.fieldErrors.frequencyMinutes, v).toMatch(/10, 15 ou 20/);
      expect(r.patch.frequencyMinutes).toBeUndefined();
    }
  });
  it("checkbox: vale o último valor; categorias por valor repetido ou vírgula", () => {
    const r = parseConfigFields(
      form([
        ["maySoleSource", "false"],
        ["maySoleSource", "true"],
        ["categories", "cidade,saude"],
        ["categories", "esportes"],
      ]),
    );
    expect(r.patch).toEqual({ maySoleSource: true, categories: ["cidade", "saude", "esportes"] });
    expect(parseConfigFields(form([["categoriesPresent", "1"]])).patch.categories).toEqual([]);
  });
  it("valores fora da lista viram erro de campo em pt-BR", () => {
    const r = parseConfigFields(
      form([
        ["imagePolicy", "tudo"],
        ["editorialScore", "9"],
        ["rateLimitPerHour", "0"],
        ["name", "   "],
      ]),
    );
    expect(Object.keys(r.fieldErrors).sort()).toEqual([
      "editorialScore",
      "imagePolicy",
      "name",
      "rateLimitPerHour",
    ]);
    expect(r.fieldErrors.editorialScore).toBe("O score vai de 1 a 5.");
  });
});

describe("parseSourceExtras", () => {
  it("normaliza endereços e recusa host interno", () => {
    const ok = parseSourceExtras(
      form([
        ["baseUrl", "folhadocerrado.example/?utm_source=x"],
        ["feedUrl", "https://folhadocerrado.example/feed"],
        ["kind", "rss"],
        ["termsReviewed", "true"],
      ]),
    );
    expect(ok).toMatchObject({
      baseUrl: "https://folhadocerrado.example/",
      feedUrl: "https://folhadocerrado.example/feed",
      kind: "rss",
      termsReviewed: true,
      fieldErrors: {},
    });
    const bad = parseSourceExtras(
      form([
        ["baseUrl", "http://169.254.169.254/"],
        ["kind", "x"],
      ]),
    );
    expect(Object.keys(bad.fieldErrors).sort()).toEqual(["baseUrl", "kind"]);
  });
  it("feed vazio vira null; consumo inválido é recusado", () => {
    expect(parseSourceExtras(form([["feedUrl", ""]])).feedUrl).toBeNull();
    expect(parseSourceExtras(form([["consumption", "{"]])).fieldErrors.consumption).toBeDefined();
    expect(
      parseSourceExtras(form([["consumption", JSON.stringify({ strategy: "rss" })]])).consumption,
    ).toEqual({ strategy: "rss" });
  });
});

describe("ids e versão", () => {
  it("uuid válido e versão inteira", () => {
    expect(idOf(form([["id", "c1000000-0000-4000-8000-000000000001"]]))).toBe(
      "c1000000-0000-4000-8000-000000000001",
    );
    expect(idOf(form([["id", "1'; drop"]]))).toBeNull();
    expect(versionOf(form([["version", "3"]]))).toBe(3);
    expect(versionOf(form([["version", "0"]]))).toBeNull();
    expect(versionOf(form([]))).toBeNull();
  });
  it("estratégia vira tipo", () => {
    expect(kindOfStrategy("atom")).toBe("rss");
    expect(kindOfStrategy("jsonfeed")).toBe("api");
    expect(kindOfStrategy("sitemap_news")).toBe("sitemap");
    expect(kindOfStrategy("page_list")).toBe("page");
  });
});
