import { DEFAULT_RULES } from "./defaults";
import { diffRules, requiredRuleKinds, ruleProblems, safetyWeakened } from "./critical";
import type { RuleSet } from "./types";

const v1: RuleSet = DEFAULT_RULES;
const cat = (rules: RuleSet, key: string, patch: object): RuleSet => ({
  ...rules,
  version: rules.version + 1,
  categories: { ...rules.categories, [key]: { ...rules.categories[key]!, ...patch } },
});

describe("requiredRuleKinds", () => {
  it("ajuste de limiar é ativação comum", () => {
    expect(requiredRuleKinds(v1, cat(v1, "servicos", { minScore: 0.5 }))).toEqual([
      "rules.activate",
    ]);
  });

  it("desligar forceReview exige force_review.disable (e só ele)", () => {
    expect(requiredRuleKinds(v1, { ...v1, version: 2, forceReview: false })).toEqual([
      "force_review.disable",
    ]);
  });

  it("forceReview já desligado na versão ativa não pede de novo", () => {
    const off = { ...v1, forceReview: false };
    expect(requiredRuleKinds(off, cat(off, "servicos", { minScore: 0.7 }))).toEqual([
      "rules.activate",
    ]);
  });

  it("tirar um tema sensível ou desbloquear Segurança exige safety.disable", () => {
    const fewer = { ...v1, version: 2, sensitiveTopics: v1.sensitiveTopics.slice(1) };
    expect(requiredRuleKinds(v1, fewer)).toEqual(["safety.disable"]);
    expect(requiredRuleKinds(v1, cat(v1, "seguranca", { mode: "review" }))).toEqual([
      "safety.disable",
    ]);
    const rest = Object.fromEntries(
      Object.entries(v1.categories).filter(([k]) => k !== "seguranca"),
    );
    expect(requiredRuleKinds(v1, { ...v1, version: 2, categories: rest })).toEqual([
      "safety.disable",
    ]);
  });

  it("tema sensível comparado sem acento e sem caixa; acrescentar tema não é crítico", () => {
    const accented = {
      ...v1,
      version: 2,
      sensitiveTopics: v1.sensitiveTopics.map((t) => (t === "violencia" ? "Violência" : t)),
    };
    expect(requiredRuleKinds(v1, accented)).toEqual(["rules.activate"]);
    const more = { ...v1, version: 2, sensitiveTopics: [...v1.sensitiveTopics, "incendio"] };
    expect(requiredRuleKinds(v1, more)).toEqual(["rules.activate"]);
  });

  it("as duas mudanças juntas exigem os dois tipos", () => {
    const both = { ...cat(v1, "seguranca", { mode: "review" }), forceReview: false };
    expect(requiredRuleKinds(v1, both)).toEqual(["force_review.disable", "safety.disable"]);
  });

  it("sem versão ativa compara com a base mais restrita", () => {
    expect(requiredRuleKinds(null, v1)).toEqual(["rules.activate"]);
    expect(requiredRuleKinds(null, { ...v1, forceReview: false })).toEqual([
      "force_review.disable",
    ]);
    expect(requiredRuleKinds(null, cat(v1, "seguranca", { mode: "review" }))).toEqual([
      "safety.disable",
    ]);
  });

  it("safetyWeakened lista o que foi afrouxado", () => {
    const fewer = { ...cat(v1, "seguranca", { mode: "review" }), sensitiveTopics: ["crime"] };
    const w = safetyWeakened(v1, fewer);
    expect(w.removedTopics).toContain("morte");
    expect(w.removedTopics).not.toContain("crime");
    expect(w.unblocked).toEqual(["seguranca"]);
  });
});

describe("ruleProblems", () => {
  it("regras v1 não têm problema", () => expect(ruleProblems(v1)).toEqual([]));

  it("Segurança ou categoria urgente em modo automático é recusada", () => {
    expect(ruleProblems(cat(v1, "seguranca", { mode: "auto" }))).toEqual([
      { field: "categories.seguranca.mode", code: "never_auto" },
    ]);
    const urgent = {
      ...v1,
      categories: {
        ...v1.categories,
        Urgente: { ...v1.categories.servicos!, mode: "auto_notify" as const },
      },
    };
    expect(ruleProblems(urgent)).toEqual([
      { field: "categories.Urgente.mode", code: "never_auto" },
    ]);
  });

  it("números fora da faixa e lista de temas vazia são recusados", () => {
    const bad = {
      ...cat(v1, "servicos", { minScore: 1.2, minSources: -1, summaryWords: 3 }),
      sensitiveTopics: [" "],
    };
    expect(ruleProblems(bad).map((p) => p.field)).toEqual([
      "sensitiveTopics",
      "categories.servicos.minSources",
      "categories.servicos.minScore",
      "categories.servicos.summaryWords",
    ]);
  });
});

describe("diffRules", () => {
  it("lista só os campos que mudaram, na ordem das categorias", () => {
    const next = {
      ...cat(cat(v1, "servicos", { minScore: 0.5 }), "cultura", { mode: "auto_notify" }),
      forceReview: false,
      sensitiveTopics: [...v1.sensitiveTopics.filter((t) => t !== "morte"), "incendio"],
    };
    expect(diffRules(v1, next)).toEqual([
      { field: "forceReview", category: null, key: "forceReview", from: true, to: false },
      {
        field: "sensitiveTopics",
        category: null,
        key: "sensitiveTopics",
        from: ["morte"],
        to: ["incendio"],
      },
      {
        field: "categories.servicos.minScore",
        category: "servicos",
        key: "minScore",
        from: 0.6,
        to: 0.5,
      },
      {
        field: "categories.cultura.mode",
        category: "cultura",
        key: "mode",
        from: "review",
        to: "auto_notify",
      },
    ]);
  });

  it("versões iguais não têm diferença", () =>
    expect(diffRules(v1, { ...v1, version: 9 })).toEqual([]));
});
