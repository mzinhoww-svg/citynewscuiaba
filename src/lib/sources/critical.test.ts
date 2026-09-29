import { criticalChanges, diffConfig, targetRefFor } from "./critical";
import type { SourceConfig } from "./types";

const base: SourceConfig = {
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
const cfg = (o: Partial<SourceConfig>): SourceConfig => ({ ...base, ...o });

describe("mudanças críticas", () => {
  it("afrouxar imagem é crítico; restringir não", () => {
    expect(
      criticalChanges(cfg({ imagePolicy: "none" }), cfg({ imagePolicy: "reproduction" })),
    ).toEqual([{ field: "imagePolicy", from: "none", to: "reproduction" }]);
    expect(
      criticalChanges(cfg({ imagePolicy: "reproduction" }), cfg({ imagePolicy: "none" })),
    ).toEqual([]);
    expect(
      criticalChanges(cfg({ imagePolicy: "none" }), cfg({ imagePolicy: "licensed_only" })),
    ).toHaveLength(1);
    expect(
      criticalChanges(
        cfg({ imagePolicy: "licensed_only" }),
        cfg({ imagePolicy: "with_agreement" }),
      ),
    ).toHaveLength(1);
  });
  it("confiabilidade para verified/primary e fonte única ligada são críticas; score e frequência não", () => {
    expect(
      criticalChanges(cfg({ reliability: "standard" }), cfg({ reliability: "primary" })),
    ).toHaveLength(1);
    expect(
      criticalChanges(cfg({ reliability: "low" }), cfg({ reliability: "verified" })),
    ).toHaveLength(1);
    expect(
      criticalChanges(cfg({ reliability: "low" }), cfg({ reliability: "standard" })),
    ).toHaveLength(0);
    expect(
      criticalChanges(cfg({ reliability: "verified" }), cfg({ reliability: "primary" })),
    ).toHaveLength(1);
    expect(
      criticalChanges(cfg({ reliability: "primary" }), cfg({ reliability: "low" })),
    ).toHaveLength(0);
    expect(
      criticalChanges(cfg({ maySoleSource: false }), cfg({ maySoleSource: true })),
    ).toHaveLength(1);
    expect(
      criticalChanges(cfg({ maySoleSource: true }), cfg({ maySoleSource: false })),
    ).toHaveLength(0);
    expect(
      criticalChanges(
        cfg({ editorialScore: 3, frequencyMinutes: null }),
        cfg({ editorialScore: 5, frequencyMinutes: 120 }),
      ),
    ).toEqual([]);
  });
  it("republicação: link_only para resumo é crítico", () => {
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
    ).toHaveLength(0);
  });
  it("diffConfig lista todos os campos que mudaram, na ordem dos campos", () => {
    const d = diffConfig(cfg({}), cfg({ editorialScore: 4, categories: ["cidades", "politica"] }));
    expect(d.map((c) => c.field)).toEqual(["categories", "editorialScore"]);
    expect(diffConfig(cfg({}), cfg({}))).toEqual([]);
  });
  it("targetRefFor usa campo em snake_case", () => {
    expect(targetRefFor("abc", { field: "imagePolicy", from: "none", to: "reproduction" })).toBe(
      "source:abc:image_policy=reproduction",
    );
    expect(targetRefFor("abc", { field: "maySoleSource", from: false, to: true })).toBe(
      "source:abc:may_be_sole_source=true",
    );
    expect(targetRefFor("abc", { field: "reliability", from: "standard", to: "primary" })).toBe(
      "source:abc:reliability=primary",
    );
  });
});
