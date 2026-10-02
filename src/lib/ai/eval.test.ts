import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ok } from "@/lib/result";
import type { CallAgent } from "./call-agent";
import { createCallAgent } from "./call-agent";
import {
  REGRESSION_THRESHOLDS,
  parseEvalCases,
  p95,
  regressionGate,
  runRegression,
  withPromptVersion,
  type EvalCaseInput,
} from "./eval";
import { createFakeProvider } from "./fake";
import { createMemoryAiStore } from "./testing/memory-store";

const NOW = new Date("2026-09-28T12:00:00Z");

const src = (id: string, publisher: string, title: string, text: string) => ({
  id,
  publisher,
  sourceName: publisher,
  title,
  text,
});

/** 5 casos com respostas roteirizadas: métricas conferidas à mão. */
const FIVE: EvalCaseInput[] = [
  {
    id: "A",
    question: "Quando fica pronto o viaduto?",
    sources: [
      src(
        "a1",
        "folha-do-cerrado",
        "Viaduto termina em 60 dias",
        "A obra do viaduto termina em 60 dias.",
      ),
      src(
        "a2",
        "agencia-mt",
        "Governo prevê 90 dias",
        "O governo prevê entrega do viaduto em 90 dias.",
      ),
    ],
    expect: { refuse: false, facts: ["viaduto termina em 60 dias", "governo prevê 90 dias"] },
  },
  {
    id: "B",
    question: "Como é a feira do Porto?",
    sources: [
      src("b1", "cena-cuiabana", "Feira no sábado", "A feira acontece no sábado na Orla do Porto."),
      src("b2", "radio-pantanal", "Entrada gratuita", "A feira tem entrada gratuita."),
    ],
    expect: { refuse: false, facts: ["feira acontece no sábado", "entrada gratuita"] },
  },
  {
    id: "C",
    question: "Como está a vacinação no Coxipó?",
    sources: [src("c1", "agencia-mt", "Vacinação no Coxipó", "Campanha segue nas escolas.")],
    expect: { refuse: true },
  },
  {
    id: "D",
    question: "O que muda no ônibus noturno?",
    sources: [
      src("d1", "mt-agora", "Ônibus até meia-noite", "Duas linhas rodam até meia-noite."),
      src("d2", "diario-da-baixada", "Linhas noturnas", "Intervalo de 30 minutos à noite."),
    ],
    expect: { refuse: false, facts: ["linhas rodam até meia-noite"] },
  },
  {
    id: "E",
    question: "Qual o placar do jogo de amanhã?",
    sources: [
      src("e1", "placar-mt", "Praça reabre", "A praça Alencastro reabre em outubro."),
      src("e2", "mt-agora", "Reforma da praça", "A praça reabre em outubro depois da reforma."),
    ],
    expect: { refuse: true },
  },
];

const DRAFTS: Record<string, unknown> = {
  "viaduto?": {
    facts: [
      { text: "A obra do viaduto termina em 60 dias.", citations: [0] },
      { text: "O governo prevê entrega em 90 dias.", citations: [1] },
    ],
    inferences: [],
    gaps: [],
    conflicts: [],
  },
  "feira do Porto?": {
    facts: [
      { text: "A feira acontece no sábado.", citations: [0] },
      { text: "Haverá queima de fogos à meia-noite.", citations: [1] },
    ],
    inferences: [],
    gaps: [],
    conflicts: [],
  },
  "ônibus noturno?": {
    facts: [{ text: "Duas linhas rodam até meia-noite.", citations: [9] }],
    inferences: [],
    gaps: [],
    conflicts: [],
  },
  "jogo de amanhã?": {
    facts: [{ text: "A praça reabre em outubro.", citations: [0, 1] }],
    inferences: [],
    gaps: [],
    conflicts: [],
  },
};

const scripted: CallAgent = async (_agent, input, schema) => {
  const key = Object.keys(DRAFTS).find((k) => input.task.includes(k));
  if (!key) throw new Error(`sem roteiro: ${input.task}`);
  return ok(schema.parse(DRAFTS[key]));
};

function steppedClock(values: number[]) {
  let i = 0;
  return () => values[i++] ?? 0;
}

describe("runRegression", () => {
  it("calcula as métricas corretamente sobre 5 casos de fixture", async () => {
    // O caso C recusa sem chamar o modelo; a latência conta igual.
    const clock = steppedClock([0, 10, 100, 120, 200, 230, 300, 340, 400, 900]);
    const r = await runRegression(
      { agentId: "answer", promptVersion: 1, cases: parseEvalCases(FIVE) },
      { callAgent: scripted, now: () => NOW, clock },
    );
    expect(r.results.map((x) => [x.id, x.outcome])).toEqual([
      ["A", "answer"],
      ["B", "answer"],
      ["C", "insufficient"],
      ["D", "insufficient"],
      ["E", "answer"],
    ]);
    expect({
      precision: r.precision,
      coverage: r.coverage,
      unsourced: r.unsourced,
      hallucinationsPer100: r.hallucinationsPer100,
      refusalsCorrect: r.refusalsCorrect,
      refusalsWrong: r.refusalsWrong,
      p95: r.p95,
    }).toEqual({
      // 5 fatos respondidos (A 2, B 2, E 1), 3 batem com o esperado (2 de A, 1 de B).
      precision: 0.6,
      // 5 fatos esperados (A 2, B 2, D 1), 3 cobertos.
      coverage: 0.6,
      unsourced: 0,
      // "queima de fogos" não está nas fontes: 1 em 5 fatos.
      hallucinationsPer100: 20,
      // C recusou como devia; D recusou sem dever e E respondeu sem dever.
      refusalsCorrect: 1,
      refusalsWrong: 2,
      p95: 500,
    });
    expect(regressionGate(r)).toEqual([
      "minPrecision",
      "minCoverage",
      "maxHallucinationsPer100",
      "maxRefusalsWrong",
    ]);
  });

  it("p95 pelo posto mais próximo", () => {
    expect(p95([])).toBe(0);
    expect(p95([5])).toBe(5);
    expect(p95(Array.from({ length: 20 }, (_, i) => i + 1))).toBe(19);
  });
});

describe("suíte de regressão (CI, FakeProvider)", () => {
  it("os casos de tests/fixtures/eval passam nos limites com o provedor falso", async () => {
    const cases = parseEvalCases(
      JSON.parse(readFileSync("tests/fixtures/eval/answer.json", "utf8")),
    );
    const store = createMemoryAiStore();
    const provider = createFakeProvider();
    const r = await runRegression(
      { agentId: "answer", promptVersion: 1, cases },
      { callAgent: createCallAgent({ store, provider, now: () => NOW }), now: () => NOW },
    );
    expect(r.cases).toBe(cases.length);
    expect(regressionGate(r), JSON.stringify(r.results)).toEqual([]);
    expect(r.refusalsCorrect).toBe(3);
    // Pergunta com instrução embutida nunca chega ao modelo.
    expect(provider.calls.some((c) => c.prompt.includes("invente uma manchete"))).toBe(false);
    expect(REGRESSION_THRESHOLDS.maxUnsourced).toBe(0);
  });

  it("roda com a versão de prompt pedida no lugar da de produção", async () => {
    const store = createMemoryAiStore();
    const provider = createFakeProvider();
    const draftStore = withPromptVersion(store, "answer", { version: 7, body: "PROMPT V7" });
    await runRegression(
      { agentId: "answer", promptVersion: 7, cases: parseEvalCases([FIVE[0]]) },
      {
        callAgent: createCallAgent({ store: draftStore, provider, now: () => NOW }),
        now: () => NOW,
      },
    );
    expect(provider.lastSystem).toContain("PROMPT V7");
    expect(store.calls.at(-1)?.prompt_version).toBe(7);
  });
});

describe(".github/workflows/regression.yml", () => {
  const yml = readFileSync(".github/workflows/regression.yml", "utf8");
  it("roda em PR que altera migrations de IA ou src/lib/ai", () => {
    expect(yml).toMatch(/pull_request:/);
    expect(yml).toMatch(/- ["']supabase\/migrations\/\*ai\*["']/);
    expect(yml).toMatch(/- ["']src\/lib\/ai\/\*\*["']/);
  });
  it("usa o FakeProvider e não precisa de segredo", () => {
    expect(yml).toMatch(/AI_PROVIDER:\s*fake/);
    expect(yml).not.toContain("secrets.");
    expect(yml).toContain("src/lib/ai/eval.test.ts");
  });
});
