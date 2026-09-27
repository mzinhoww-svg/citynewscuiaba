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
