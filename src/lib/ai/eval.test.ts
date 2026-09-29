import { describe, expect, it } from "vitest";
import { createFakeProvider } from "./fake";
import { EVAL_CASES } from "./eval-cases";
import { percentile, runRegression } from "./eval";

describe("percentile (posto mais próximo)", () => {
  it("p95 de 20 valores é o 19º", () =>
    expect(
      percentile(
        Array.from({ length: 20 }, (_, i) => (i + 1) * 10),
        95,
      ),
    ).toBe(190));
  it("lista vazia dá 0", () => expect(percentile([], 95)).toBe(0));
  it("um valor só é ele mesmo", () => expect(percentile([7], 95)).toBe(7));
});

describe("runRegression com o provedor falso (5 casos de fixture)", () => {
  it("calcula precisão, cobertura, recusas e latência", async () => {
    const r = await runRegression({ agentId: "answer", promptVersion: 1, cases: [...EVAL_CASES] });
    expect(EVAL_CASES).toHaveLength(5);
    // 2 respondidos x 2 fontes = 4 fatos, todos sustentados pelas fontes citadas.
    expect(r.precision).toBe(1);
    expect(r.hallucinationsPer100).toBe(0);
    expect(r.unsourced).toBe(0);
    // Esperavam resposta: 3 casos; cobertos: 2.
    expect(r.coverage).toBeCloseTo(2 / 3, 5);
    expect(r.refusalsCorrect).toBe(2);
    expect(r.refusalsWrong).toBe(1);
    expect(r.errors).toBe(0);
    expect(r.cases).toBe(5);
    expect(r.p95).toBeGreaterThanOrEqual(0);
  });

  it("fato inventado derruba a precisão e conta como alucinação", async () => {
    const fake = createFakeProvider();
    fake.script([
      {
        output: {
          facts: [
            { text: "O viaduto deve ser entregue nas próximas semanas.", citations: [0] },
            { text: "A prefeitura inaugurou um estádio novo em Rondonópolis.", citations: [1] },
          ],
          inferences: [],
          gaps: [],
          conflicts: [],
        },
      },
    ]);
    const r = await runRegression(
      { agentId: "answer", promptVersion: 1, cases: [EVAL_CASES[0]!] },
      { provider: fake },
    );
    expect(r.precision).toBe(0.5);
    expect(r.hallucinationsPer100).toBe(50);
    expect(r.refusalsWrong).toBe(0);
    expect(r.coverage).toBe(1);
  });

  it("falha do provedor conta como erro, não como recusa correta", async () => {
    const fake = createFakeProvider();
    fake.script([{ error: "provider" }, { error: "provider" }]);
    const r = await runRegression(
      { agentId: "answer", promptVersion: 1, cases: [EVAL_CASES[0]!] },
      { provider: fake },
    );
    expect(r.errors).toBe(1);
    expect(r.coverage).toBe(0);
    expect(r.refusalsCorrect).toBe(0);
  });

  it("agente sem contrato de avaliação é recusado", async () => {
    await expect(
      runRegression({ agentId: "classify", promptVersion: 1, cases: [] }),
    ).rejects.toThrow(/answer/);
  });

  it("p95 vem da latência de cada caso", async () => {
    const ticks = [0, 10, 10, 30, 30, 60, 60, 100, 100, 150];
    let i = 0;
    const r = await runRegression(
      { agentId: "answer", promptVersion: 1, cases: [...EVAL_CASES] },
      { clock: () => ticks[i++] ?? 0 },
    );
    expect(r.p95).toBe(50);
  });
});
