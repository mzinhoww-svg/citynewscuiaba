import { criticalChanges, diffConfig, targetRefFor } from "./critical";
import type { SourceConfig } from "./types";

function cfg(overrides: Partial<SourceConfig> = {}): SourceConfig {
  return {
    name: "Folha do Cerrado",
    displayName: null,
    slug: "folha-do-cerrado",
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
    strategy: "rss",
    baseUrl: "https://folhadocerrado.example",
    feedUrl: "https://folhadocerrado.example/feed",
    pageSelectors: null,
    frequencyMinutes: null,
    rateLimitPerHour: 30,
    termsMinIntervalMinutes: null,
    editorialScore: 3,
    priority: 2,
    recPinned: false,
    recLocalHighlight: false,
    recExcluded: false,
    trusted: false,
    ...overrides,
  };
}

describe("criticalChanges", () => {
  it("afrouxar imagem é crítico; restringir não", () => {
    expect(
      criticalChanges(cfg({ imagePolicy: "none" }), cfg({ imagePolicy: "reproduction" })),
    ).toEqual([{ field: "imagePolicy", from: "none", to: "reproduction" }]);
    expect(
      criticalChanges(cfg({ imagePolicy: "reproduction" }), cfg({ imagePolicy: "none" })),
    ).toEqual([]);
  });

  it("liberar resumo é crítico; voltar a link não", () => {
    expect(
      criticalChanges(
        cfg({ republishPolicy: "link_only" }),
        cfg({ republishPolicy: "summary_2_sentences" }),
      ),
    ).toHaveLength(1);
    expect(
      criticalChanges(
        cfg({ republishPolicy: "summary_2_sentences" }),
        cfg({ republishPolicy: "link_only" }),
      ),
    ).toEqual([]);
  });

  it("confiabilidade para primary e fonte única ligada são críticas; score e frequência não", () => {
    expect(
      criticalChanges(cfg({ reliability: "standard" }), cfg({ reliability: "primary" })),
    ).toHaveLength(1);
    expect(
      criticalChanges(cfg({ reliability: "primary" }), cfg({ reliability: "low" })),
    ).toHaveLength(0);
    expect(
      criticalChanges(cfg({ maySoleSource: false }), cfg({ maySoleSource: true })),
    ).toHaveLength(1);
    expect(
      criticalChanges(
        cfg({ editorialScore: 3, frequencyMinutes: null }),
        cfg({ editorialScore: 5, frequencyMinutes: 120 }),
      ),
    ).toEqual([]);
  });
});

describe("diffConfig", () => {
  it("lista qualquer campo diferente, crítico ou não", () => {
    expect(diffConfig(cfg({ editorialScore: 3 }), cfg({ editorialScore: 5 }))).toEqual([
      { field: "editorialScore", from: 3, to: 5 },
    ]);
  });
});

describe("targetRefFor", () => {
  it("monta source:<id>:<campo_snake>=<valor>", () => {
    expect(targetRefFor("abc", { field: "imagePolicy", from: "none", to: "reproduction" })).toBe(
      "source:abc:image_policy=reproduction",
    );
    expect(targetRefFor("abc", { field: "maySoleSource", from: false, to: true })).toBe(
      "source:abc:may_be_sole_source=true",
    );
  });
});
