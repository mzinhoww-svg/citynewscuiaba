import { decidePublication as d } from ".";
import { DEFAULT_RULES } from "./defaults";
const open = { ...DEFAULT_RULES, forceReview: false };
const ok = {
  category: "servicos",
  tags: [],
  independentSources: 2,
  primarySources: 0,
  centralConflict: false,
  imageApproved: false,
  confidenceScore: 0.6,
  breaking: false,
};
it("serviços com 2 fontes e 0,60 publica", () => expect(d(ok, open).route).toBe("publish"));
it("forceReview manda tudo para revisão", () => expect(d(ok, DEFAULT_RULES).route).toBe("review"));
it("breaking sempre revisão", () =>
  expect(d({ ...ok, breaking: true }, open).rule).toBe("breaking"));
it("tema sensível vence tudo", () =>
  expect(d({ ...ok, tags: ["crime"] }, { ...open, sensitiveTopics: ["crime"] }).rule).toBe(
    "sensitive",
  ));
it("segurança bloqueada retém", () =>
  expect(d({ ...ok, category: "seguranca" }, open).route).toBe("hold"));
it("Segurança nunca publica sozinha, mesmo com modo auto adulterado nos dados (gate P5, achado 7)", () => {
  const forced = {
    ...open,
    categories: {
      ...open.categories,
      seguranca: { ...open.categories.seguranca!, mode: "auto" as const },
      "seguranca-urbana": { ...open.categories.servicos!, mode: "auto_notify" as const },
    },
  };
  const c = { ...ok, category: "seguranca", confidenceScore: 1, independentSources: 5 };
  expect(d(c, forced)).toMatchObject({ route: "hold", rule: "blocked" });
  expect(d({ ...c, category: "Segurança" }, forced).route).toBe("hold");
  expect(d({ ...c, category: "seguranca-urbana" }, forced).route).toBe("hold");
});
it("conflito central revisão", () =>
  expect(
    d(
      {
        ...ok,
        category: "cidade",
        primarySources: 1,
        imageApproved: true,
        confidenceScore: 0.9,
        centralConflict: true,
      },
      open,
    ).rule,
  ).toBe("conflict"));
it("cidade sem imagem aprovada revisão", () =>
  expect(d({ ...ok, category: "cidade", primarySources: 1, confidenceScore: 0.9 }, open).rule).toBe(
    "image",
  ));
it("cidade completa publica com aviso", () =>
  expect(
    d(
      { ...ok, category: "cidade", primarySources: 1, imageApproved: true, confidenceScore: 0.9 },
      open,
    ).route,
  ).toBe("publish_notify"));
it("categoria desconhecida revisão", () =>
  expect(d({ ...ok, category: "astrologia" }, open).rule).toBe("unknown_category"));
it("abaixo da confiança mínima revisão", () =>
  expect(d({ ...ok, confidenceScore: 0.59 }, open).rule).toBe("min_score"));

// Casos adicionais
it("categoria desconhecida nunca publica, mesmo com tudo em ordem", () => {
  const r = d(
    { ...ok, category: "astrologia", primarySources: 3, imageApproved: true, confidenceScore: 1 },
    open,
  );
  expect(r.route).toBe("review");
});
it("poucas fontes revisão", () =>
  expect(d({ ...ok, independentSources: 1 }, open).rule).toBe("min_sources"));
it("sem fonte primária quando exigida revisão", () =>
  expect(
    d({ ...ok, category: "agenda", independentSources: 1, confidenceScore: 0.9 }, open).rule,
  ).toBe("primary"));
it("categoria em revisão vai para revisão pelo modo", () => {
  const r = d({ ...ok, category: "cultura", imageApproved: true, confidenceScore: 0.9 }, open);
  expect(r).toMatchObject({ route: "review", rule: "mode" });
});
it("breaking vence tema sensível e forceReview", () =>
  expect(
    d({ ...ok, breaking: true, tags: ["crime"] }, { ...DEFAULT_RULES, sensitiveTopics: ["crime"] })
      .rule,
  ).toBe("breaking"));
it("tema sensível ignora caixa e acento", () =>
  expect(d({ ...ok, tags: ["Violência"] }, { ...open, sensitiveTopics: ["violencia"] }).rule).toBe(
    "sensitive",
  ));
it("rationale em pt-BR com os números usados", () => {
  expect(d({ ...ok, confidenceScore: 0.59 }, open).rationale).toBe(
    "Confiança 0,59 abaixo do mínimo 0,60 da categoria servicos.",
  );
});
it("DEFAULT_RULES é a versão 1 com forceReview ligado", () => {
  expect(DEFAULT_RULES.version).toBe(1);
  expect(DEFAULT_RULES.forceReview).toBe(true);
  expect(Object.keys(DEFAULT_RULES.categories).sort()).toEqual([
    "agenda",
    "cidade",
    "clima",
    "cultura",
    "economia",
    "esportes",
    "politica",
    "saude",
    "seguranca",
    "servicos",
  ]);
});

// Revisão do gate P0: entrada inválida falha fechado.
describe("entrada inválida vai para revisão (invalid_input)", () => {
  it.each([
    ["independentSources NaN", { independentSources: Number.NaN }],
    ["independentSources Infinity", { independentSources: Number.POSITIVE_INFINITY }],
    ["independentSources negativo", { independentSources: -1 }],
    ["primarySources NaN", { primarySources: Number.NaN }],
    ["primarySources -Infinity", { primarySources: Number.NEGATIVE_INFINITY }],
    ["confidenceScore NaN", { confidenceScore: Number.NaN }],
    ["confidenceScore Infinity", { confidenceScore: Number.POSITIVE_INFINITY }],
    ["confidenceScore negativo", { confidenceScore: -0.5 }],
    ["confidenceScore acima de 1", { confidenceScore: 1.5 }],
  ])("%s", (_name, patch) => {
    const r = d({ ...ok, ...patch }, open);
    expect(r.route).toBe("review");
    expect(r.rule).toBe("invalid_input");
    expect(r.rationale).toMatch(/inválid/);
  });
  it("regra com mínimo não finito também falha fechado", () => {
    const broken = {
      ...open,
      categories: {
        ...open.categories,
        servicos: { ...open.categories.servicos!, minScore: Number.NaN },
      },
    };
    expect(d({ ...ok, confidenceScore: 0.99 }, broken).rule).toBe("invalid_input");
  });
});

describe("temas sensíveis normalizados (A-021)", () => {
  const rules = { ...open, sensitiveTopics: DEFAULT_RULES.sensitiveTopics };
  it.each([
    "crimes",
    "Crime",
    "violência doméstica",
    "Violência_Doméstica",
    "violencia-domestica",
    "homicídio",
    "Homicídios",
    "assassinato",
    "estupro",
    "feminicídio",
    "sequestro",
    "overdose",
    "mortes",
    "acidente de trânsito",
    "eleições",
    "saúde individual",
    "saude_individual",
  ])("%s é sensível", (tag) => expect(d({ ...ok, tags: [tag] }, rules).rule).toBe("sensitive"));
  it.each([
    "incidente",
    "desmorte",
    "morteiro",
    "saúde",
    "criação",
    "criminologia-curso",
    "abusivo",
  ])("%s não casa dentro de palavra não relacionada", (tag) =>
    expect(d({ ...ok, tags: [tag] }, rules).rule).not.toBe("sensitive"),
  );
  it("categoria também é conferida", () =>
    expect(d({ ...ok, category: "Crimes" }, rules).rule).toBe("sensitive"));
  it("lista padrão inclui os novos temas", () =>
    expect(DEFAULT_RULES.sensitiveTopics).toEqual(
      expect.arrayContaining([
        "homicidio",
        "assassinato",
        "estupro",
        "feminicidio",
        "sequestro",
        "overdose",
      ]),
    ));
});

describe("item marcado sensível pelo classify (P3-T8)", () => {
  it("sensitive=true vai para revisão mesmo sem etiqueta da lista", () => {
    const r = d({ ...ok, sensitive: true }, open);
    expect(r).toMatchObject({ route: "review", rule: "sensitive" });
    expect(r.rationale).toMatch(/sensível/);
  });
  it("breaking continua vencendo", () =>
    expect(d({ ...ok, sensitive: true, breaking: true }, open).rule).toBe("breaking"));
});
