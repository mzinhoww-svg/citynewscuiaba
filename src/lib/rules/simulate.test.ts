import { DEFAULT_RULES } from "./defaults";
import { ruleDiff, simulateRules, validateRuleSet } from "./simulate";
import type { Candidate, RuleSet } from ".";

/** Amostra determinística de 100 candidatos (os últimos 7 dias numa fixture). */
function sample(): Candidate[] {
  const cats = ["servicos", "cidade", "cultura", "esportes", "clima"];
  const out: Candidate[] = [];
  for (let i = 0; i < 100; i++) {
    out.push({
      category: cats[i % cats.length]!,
      tags: i % 10 === 0 ? ["crime"] : [],
      independentSources: 1 + (i % 3),
      primarySources: i % 2,
      centralConflict: i % 25 === 0,
      imageApproved: i % 4 !== 0,
      confidenceScore: 0.5 + (i % 5) * 0.1,
      breaking: false,
    });
  }
  return out;
}

const open: RuleSet = { ...DEFAULT_RULES, forceReview: false };

describe("simulateRules", () => {
  it("regras iguais não mudam nenhum destino", () => {
    const r = simulateRules(open, sample(), open);
    expect(r.changed).toBe(0);
    expect(r.total).toBe(100);
    expect(r.byRoute).toEqual({});
  });

  it("desligar forceReview move para publicação os itens que passam nas regras", () => {
    const r = simulateRules(open, sample(), DEFAULT_RULES);
    // Contagem conhecida da fixture: 10 de clima (com primária) e 9 de esportes (≥ 2 fontes e
    // imagem aprovada); serviços e cidade ficam abaixo da confiança mínima, cultura é revisão.
    expect(r.changed).toBe(19);
    expect(r.byRoute.review).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ to: "publish" }),
        expect.objectContaining({ to: "publish_notify" }),
      ]),
    );
    const sum = Object.values(r.byRoute)
      .flat()
      .reduce((n, x) => n + x.count, 0);
    expect(sum).toBe(19);
  });

  it("bloquear uma categoria manda os itens dela para retenção", () => {
    const next: RuleSet = {
      ...open,
      categories: {
        ...open.categories,
        cultura: { ...open.categories.cultura!, mode: "blocked" },
      },
    };
    const r = simulateRules(next, sample(), open);
    expect(r.changed).toBe(20); // os 20 itens de cultura da fixture (nenhum com tema sensível)
    expect(r.byRoute.review).toEqual([{ from: "review", to: "hold", count: 20 }]);
  });

  it("amostra vazia: nada muda", () => {
    expect(simulateRules(open, [], DEFAULT_RULES)).toEqual({ changed: 0, total: 0, byRoute: {} });
  });
});

describe("validateRuleSet", () => {
  it("aceita as regras padrão e rejeita número fora da faixa", () => {
    expect(validateRuleSet(DEFAULT_RULES).ok).toBe(true);
    const bad = validateRuleSet({
      ...DEFAULT_RULES,
      categories: {
        ...DEFAULT_RULES.categories,
        clima: { ...DEFAULT_RULES.categories.clima!, minScore: 1.5 },
      },
    });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error).toMatch(/clima/);
  });
  it("rejeita categoria vazia ou tema sensível vazio", () => {
    expect(validateRuleSet({ ...DEFAULT_RULES, categories: {} }).ok).toBe(false);
    expect(validateRuleSet({ ...DEFAULT_RULES, sensitiveTopics: ["crime", " "] }).ok).toBe(false);
  });
});

describe("ruleDiff", () => {
  it("lista o que muda entre duas versões, campo a campo", () => {
    const next: RuleSet = {
      ...DEFAULT_RULES,
      forceReview: false,
      sensitiveTopics: [...DEFAULT_RULES.sensitiveTopics, "greve"],
      categories: {
        ...DEFAULT_RULES.categories,
        cidade: { ...DEFAULT_RULES.categories.cidade!, minSources: 3 },
      },
    };
    expect(ruleDiff(DEFAULT_RULES, next)).toEqual([
      { path: "forceReview", from: "true", to: "false" },
      { path: "sensitiveTopics", from: "", to: "+greve" },
      { path: "cidade.minSources", from: "2", to: "3" },
    ]);
  });
});
