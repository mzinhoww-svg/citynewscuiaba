import { DEFAULT_RULES } from "./defaults";
import type { Candidate } from ".";
import { simulateRules } from "./simulate";
import type { RuleSet } from "./types";

/*
 * Simulação de regras (plano P5 Task 2; Review Focus 5): amostra de 100 candidatos de fixture
 * com grupos de destino conhecidos. Com as regras v1 sem forceReview:
 *   40 Serviços prontos (2 fontes, 0,70)            → publish
 *   20 Serviços com confiança 0,55 (mínimo 0,60)    → review (min_score)
 *   10 Segurança                                    → hold (bloqueada)
 *   10 Cidade urgentes                              → review (breaking)
 *   20 Cultura com 2 fontes e imagem aprovada       → review (modo revisão)
 */
const base: Candidate = {
  category: "servicos",
  tags: [],
  independentSources: 2,
  primarySources: 0,
  centralConflict: false,
  imageApproved: false,
  confidenceScore: 0.7,
  breaking: false,
};
const many = (n: number, c: Partial<Candidate>): Candidate[] =>
  Array.from({ length: n }, () => ({ ...base, ...c }));

const SAMPLE: Candidate[] = [
  ...many(40, {}),
  ...many(20, { confidenceScore: 0.55 }),
  ...many(10, { category: "seguranca" }),
  ...many(10, {
    category: "cidade",
    primarySources: 1,
    imageApproved: true,
    confidenceScore: 0.9,
    breaking: true,
  }),
  ...many(20, { category: "cultura", imageApproved: true }),
];

const current: RuleSet = { ...DEFAULT_RULES, forceReview: false };
const withCategory = (rules: RuleSet, key: string, patch: object): RuleSet => ({
  ...rules,
  version: rules.version + 1,
  categories: {
    ...rules.categories,
    [key]: { ...rules.categories[key]!, ...patch },
  },
});

it("a amostra tem 100 candidatos", () => expect(SAMPLE).toHaveLength(100));

it("regras iguais não mudam nenhum destino", () => {
  expect(simulateRules(current, SAMPLE, current)).toMatchObject({ changed: 0, byRoute: {} });
});

it("baixar a confiança mínima de Serviços para 0,50 publica exatamente os 20 itens de 0,55", () => {
  const next = withCategory(current, "servicos", { minScore: 0.5 });
  const r = simulateRules(next, SAMPLE, current);
  expect(r.changed).toBe(20);
  expect(r.byRoute).toEqual({ review: [{ from: "review", to: "publish", count: 20 }] });
});

it("Cultura em modo automático com aviso muda os 20 de Cultura", () => {
  const next = withCategory(current, "cultura", { mode: "auto_notify" });
  const r = simulateRules(next, SAMPLE, current);
  expect(r.changed).toBe(20);
  expect(r.byRoute).toEqual({ review: [{ from: "review", to: "publish_notify", count: 20 }] });
});

it("ligar forceReview manda para revisão os 40 que publicavam e os 10 retidos de Segurança", () => {
  const next: RuleSet = { ...current, version: 2, forceReview: true };
  const r = simulateRules(next, SAMPLE, current);
  expect(r.changed).toBe(50);
  expect(r.byRoute).toEqual({
    publish: [{ from: "publish", to: "review", count: 40 }],
    hold: [{ from: "hold", to: "review", count: 10 }],
  });
});

it("urgente e Segurança nunca publicam, nem com Cidade e Segurança liberadas", () => {
  const loose = withCategory(withCategory(current, "cidade", { mode: "auto" }), "seguranca", {
    mode: "auto",
  });
  const r = simulateRules(loose, SAMPLE, current);
  // Segurança liberada na regra muda de retida para revisão (nunca para publicar);
  // os urgentes de Cidade continuam em revisão.
  expect(r.byRoute).toEqual({ hold: [{ from: "hold", to: "review", count: 10 }] });
  expect(r.changed).toBe(10);
});

it("várias transições saem ordenadas por quantidade, e a soma bate com changed", () => {
  const next = withCategory(withCategory(current, "servicos", { minScore: 0.8 }), "cultura", {
    mode: "auto",
  });
  const r = simulateRules(next, SAMPLE, current);
  expect(r.byRoute).toEqual({
    publish: [{ from: "publish", to: "review", count: 40 }],
    review: [{ from: "review", to: "publish", count: 20 }],
  });
  expect(r.changed).toBe(60);
  const sum = Object.values(r.byRoute)
    .flat()
    .reduce((s, x) => s + x.count, 0);
  expect(sum).toBe(r.changed);
});
