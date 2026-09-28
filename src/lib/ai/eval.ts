/**
 * Avaliação e regressão da IA (P5-T6, tela O14). Roda casos fixos da busca com IA pelo mesmo
 * caminho de produção (`buildAnswer` → `callAgent`) e mede:
 *
 * - `precision`: fatos da resposta que batem com algum fato esperado ÷ fatos respondidos;
 * - `coverage`: fatos esperados encontrados na resposta ÷ fatos esperados (casos que devem ter
 *   resposta);
 * - `unsourced`: fatos sem citação válida (deve ser 0: regra 5 do CLAUDE.md);
 * - `hallucinationsPer100`: fatos sem apoio no texto das fontes citadas, a cada 100 fatos;
 * - `refusalsCorrect` / `refusalsWrong`: recusa quando devia recusar / decisão de recusa errada
 *   (recusou o que devia responder ou respondeu o que devia recusar);
 * - `p95`: latência (ms) do percentil 95, por caso.
 *
 * Função pura com dependências injetadas: em CI e nos testes usa o `FakeProvider`
 * (`AI_PROVIDER=fake`), sem rede e sem segredo.
 */
import { z } from "zod";
import type { Label } from "@/lib/labels";
import { textTokens } from "@/lib/pipeline/text-features";
import { ok } from "@/lib/result";
import { buildAnswer, type AiAnswer, type SourceCandidate } from "./answer";
import type { CallAgent } from "./call-agent";
import type { AgentConfig, AiStore } from "./types";

/** Agentes com regressão automática no MVP: a busca com IA (spec §5.5). */
export const EVAL_AGENTS = ["answer"] as const;
export type EvalAgent = (typeof EVAL_AGENTS)[number];

const EvalSourceSchema = z.object({
  id: z.string().min(1),
  publisher: z.string().min(1),
  sourceName: z.string().min(1),
  title: z.string().min(1),
  text: z.string(),
  primary: z.boolean().default(false),
  publishedAt: z.string().nullable().default(null),
});

export const EvalCaseSchema = z.object({
  id: z.string().min(1).max(80),
  question: z.string().min(1).max(300),
  sources: z.array(EvalSourceSchema).max(12),
  expect: z.object({
    /** A resposta correta é recusar (menos de 2 fontes relevantes, pergunta fora do escopo). */
    refuse: z.boolean(),
    /** Fatos que a resposta precisa trazer (frases curtas). */
    facts: z.array(z.string().min(1)).default([]),
  }),
});
export type EvalCase = z.infer<typeof EvalCaseSchema>;
export type EvalCaseInput = z.input<typeof EvalCaseSchema>;

export interface RegressionMetrics {
  precision: number;
  coverage: number;
  unsourced: number;
  hallucinationsPer100: number;
  refusalsCorrect: number;
  refusalsWrong: number;
  p95: number;
}

export interface CaseResult {
  id: string;
  outcome: "answer" | "insufficient" | "error";
  expectedRefuse: boolean;
  facts: number;
  matchedFacts: number;
  expectedFacts: number;
  coveredFacts: number;
  unsourced: number;
  hallucinations: number;
  latencyMs: number;
}

export interface RegressionReport extends RegressionMetrics {
  cases: number;
  results: CaseResult[];
}

export interface RegressionDeps {
  callAgent: CallAgent;
  now: () => Date;
  /** Relógio em ms para a latência (padrão `performance.now`). */
  clock?: () => number;
}

/** Limites da regressão (bloqueiam o PR e a publicação de prompt). */
export const REGRESSION_THRESHOLDS = {
  minPrecision: 0.9,
  minCoverage: 0.8,
  maxUnsourced: 0,
  maxHallucinationsPer100: 2,
  maxRefusalsWrong: 0,
  maxP95Ms: 8_000,
} as const;

export type GateFailure = keyof typeof REGRESSION_THRESHOLDS;

/** Quais limites a rodada violou (vazio = passou). */
export function regressionGate(m: RegressionMetrics): GateFailure[] {
  const t = REGRESSION_THRESHOLDS;
  const out: GateFailure[] = [];
  if (m.precision < t.minPrecision) out.push("minPrecision");
  if (m.coverage < t.minCoverage) out.push("minCoverage");
  if (m.unsourced > t.maxUnsourced) out.push("maxUnsourced");
  if (m.hallucinationsPer100 > t.maxHallucinationsPer100) out.push("maxHallucinationsPer100");
  if (m.refusalsWrong > t.maxRefusalsWrong) out.push("maxRefusalsWrong");
  if (m.p95 > t.maxP95Ms) out.push("maxP95Ms");
  return out;
}

const STOP = new Set([
  "para",
  "com",
  "que",
  "uma",
  "dos",
  "das",
  "nos",
  "nas",
  "por",
  "pela",
  "pelo",
  "como",
  "mais",
  "segundo",
  "sobre",
  "entre",
  "esta",
  "este",
  "essa",
  "esse",
  "sera",
  "foram",
  "sao",
  "tem",
]);

/** Palavras que carregam sentido (sem acento, ≥ 3 letras ou números, sem palavras vazias). */
export function keyWords(text: string): Set<string> {
  return new Set(textTokens(text).filter((w) => (w.length >= 3 || /\d/.test(w)) && !STOP.has(w)));
}

/** Parte de `a` que aparece em `b` (0 a 1). */
function share(a: Set<string>, b: Set<string>): number {
  if (a.size === 0) return 0;
  let n = 0;
  for (const w of a) if (b.has(w)) n++;
  return n / a.size;
}

/** Fato esperado presente numa frase: ≥ 60% das palavras-chave do esperado. */
export const MATCH_SHARE = 0.6;
/** Frase apoiada pelas fontes citadas: ≥ 60% das palavras-chave dela estão no texto delas. */
export const SUPPORT_SHARE = 0.6;

export function p95(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(0.95 * sorted.length) - 1)]!;
}

const round = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d;

function candidates(c: EvalCase): SourceCandidate[] {
  return c.sources.map((s) => {
    const label: Label = { kind: "aggregated", text: "AGREGADO", detail: s.sourceName };
    return {
      id: s.id,
      kind: "aggregated",
      title: s.title,
      url: `https://${s.publisher}.example/${s.id}`,
      sourceName: s.sourceName,
      publisher: s.publisher,
      publishedAt: s.publishedAt,
      primary: s.primary,
      sponsored: false,
      label,
      text: s.text,
    };
  });
}

function scoreCase(c: EvalCase, a: AiAnswer, latencyMs: number): CaseResult {
  const base: CaseResult = {
    id: c.id,
    outcome: a.kind,
    expectedRefuse: c.expect.refuse,
    facts: 0,
    matchedFacts: 0,
    expectedFacts: c.expect.refuse ? 0 : c.expect.facts.length,
    coveredFacts: 0,
    unsourced: 0,
    hallucinations: 0,
    latencyMs,
  };
  if (a.kind !== "answer") return base;
  const byId = new Map(c.sources.map((s) => [s.id, s]));
  const expected = c.expect.facts.map(keyWords);
  const factWords = a.facts.map((f) => keyWords(f.text));
  let matched = 0;
  let unsourced = 0;
  let hallucinations = 0;
  a.facts.forEach((f, i) => {
    const words = factWords[i]!;
    if (expected.some((e) => share(e, words) >= MATCH_SHARE)) matched++;
    const cited = f.citations.flatMap((k) => {
      const ref = a.sources[k];
      const src = ref ? byId.get(ref.id) : undefined;
      return src ? [`${src.title} ${src.text}`] : [];
    });
    if (cited.length === 0) {
      unsourced++;
      return;
    }
    if (share(words, keyWords(cited.join(" "))) < SUPPORT_SHARE) hallucinations++;
  });
  const covered = c.expect.refuse
    ? 0
    : expected.filter((e) => factWords.some((w) => share(e, w) >= MATCH_SHARE)).length;
  return {
    ...base,
    facts: a.facts.length,
    matchedFacts: matched,
    coveredFacts: covered,
    unsourced,
    hallucinations,
  };
}

/** Métricas da rodada a partir dos resultados por caso. */
export function aggregate(results: CaseResult[]): RegressionMetrics {
  const sum = (k: keyof CaseResult) => results.reduce((s, r) => s + Number(r[k]), 0);
  const facts = sum("facts");
  const expectedFacts = sum("expectedFacts");
  const refused = (r: CaseResult) => r.outcome !== "answer";
  return {
    precision: facts > 0 ? round(sum("matchedFacts") / facts, 3) : 0,
    coverage: expectedFacts > 0 ? round(sum("coveredFacts") / expectedFacts, 3) : 1,
    unsourced: sum("unsourced"),
    hallucinationsPer100: facts > 0 ? round((sum("hallucinations") / facts) * 100, 1) : 0,
    refusalsCorrect: results.filter((r) => r.expectedRefuse && r.outcome === "insufficient").length,
    refusalsWrong: results.filter((r) => r.expectedRefuse !== refused(r)).length,
    p95: Math.round(p95(results.map((r) => r.latencyMs))),
  };
}

/**
 * Roda os casos com o agente e a versão de prompt informados (o `callAgent` já vem montado com
 * o registro dessa versão; ver `withPromptVersion`) e devolve métricas e resultado por caso.
 */
export async function runRegression(
  input: { agentId: EvalAgent; promptVersion: number; cases: EvalCase[] },
  deps: RegressionDeps,
): Promise<RegressionReport> {
  const clock = deps.clock ?? (() => performance.now());
  const results: CaseResult[] = [];
  for (const c of input.cases) {
    const cands = candidates(c);
    const t0 = clock();
    const answer = await buildAnswer(c.question, {
      retrieve: async () => ok(cands),
      callAgent: deps.callAgent,
      now: deps.now,
    });
    results.push(scoreCase(c, answer, clock() - t0));
  }
  return { ...aggregate(results), cases: results.length, results };
}

/**
 * Registro de IA com o prompt de uma versão específica no lugar do prompt em produção (rodar a
 * regressão de um rascunho antes de pedir a publicação).
 */
export function withPromptVersion(
  store: AiStore,
  agentId: string,
  prompt: { version: number; body: string } | null,
): AiStore {
  if (!prompt) return store;
  return {
    ...store,
    async agent(id) {
      const a = await store.agent(id);
      if (!a || id !== agentId) return a;
      const out: AgentConfig = { ...a, prompt };
      return out;
    },
  };
}

/** Lê e valida uma lista de casos (arquivo de fixture ou `eval_cases`). */
export function parseEvalCases(value: unknown): EvalCase[] {
  return z.array(EvalCaseSchema).parse(value);
}
