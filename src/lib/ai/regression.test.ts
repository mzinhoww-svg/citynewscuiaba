import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EVAL_CASES } from "./eval-cases";
import { runRegression } from "./eval";
import { REGRESSION_LIMITS } from "./eval-limits";

/*
 * Porta de aceite da regressão da IA (roda em PR que mexe em `src/lib/ai/**`). Os limites ficam
 * em `eval-limits.ts`, que a tela de avaliações também mostra.
 */
describe("regressão da IA (provedor falso)", () => {
  it("as métricas ficam dentro dos limites de aceite", async () => {
    const r = await runRegression({ agentId: "answer", promptVersion: 1, cases: [...EVAL_CASES] });
    expect(r.precision).toBeGreaterThanOrEqual(REGRESSION_LIMITS.minPrecision);
    expect(r.hallucinationsPer100).toBeLessThanOrEqual(REGRESSION_LIMITS.maxHallucinationsPer100);
    expect(r.unsourced).toBeLessThanOrEqual(REGRESSION_LIMITS.maxUnsourced);
    expect(r.coverage).toBeGreaterThanOrEqual(REGRESSION_LIMITS.minCoverage);
    expect(r.refusalsWrong).toBeLessThanOrEqual(REGRESSION_LIMITS.maxRefusalsWrong);
    expect(r.errors).toBe(0);
  });
});

describe(".github/workflows/regression.yml", () => {
  const yml = readFileSync(".github/workflows/regression.yml", "utf8");
  it("dispara em PR que altera migrations de IA ou src/lib/ai", () => {
    expect(yml).toMatch(/pull_request:\s*\n\s+paths:/);
    expect(yml).toContain('"supabase/migrations/*ai*"');
    expect(yml).toContain('"src/lib/ai/**"');
  });
  it("usa o provedor falso e nenhum segredo", () => {
    expect(yml).toContain("AI_PROVIDER: fake");
    expect(yml).not.toMatch(/secrets\./);
    expect(yml).not.toMatch(/OPENROUTER/);
  });
});
