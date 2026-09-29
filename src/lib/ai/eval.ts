import { textTokens } from "@/lib/pipeline/text-features";
import { err, ok } from "@/lib/result";
import { buildAnswer, type AiAnswer, type SourceCandidate } from "./answer";
import { createCallAgent } from "./call-agent";
import { createFakeProvider } from "./fake";
import { createMemoryAiStore } from "./testing/memory-store";
import type { ModelProvider } from "./types";

/*
 * Regressão da IA (P5-T6; spec §9 e A-035). Roda casos fixos pelo mesmo caminho da produção
 * (`buildAnswer` → `callAgent`: sanitização, delimitadores de dados, schema zod) e calcula
 * métricas sobre o que sairia ao leitor. Em CI o provedor é o falso (sem rede e sem segredo).
 * Só o agente `answer` tem contrato de avaliação hoje: é o único com regra de recusa e
 * citação (CLAUDE.md §5.5).
 */

export interface EvalSource {
  id: string;
  /** Chave de independência: veículo. */
  publisher: string;
  sourceName: string;
  title: string;
  text: string;
  sponsored?: boolean;
}

export interface EvalCase {
  id: string;
  question: string;
  sources: EvalSource[];
  expect: {
    /** Esperado: recusar (menos de 2 veículos independentes). */
    refuse: boolean;
    /** Termos (sem acento, minúsculos) que precisam aparecer nos fatos de uma resposta esperada. */
    keyTerms?: string[];
  };
}

export interface EvalMetrics {
  /** Fatos sustentados pelas fontes citadas / fatos publicados (0 a 1). */
  precision: number;
  /** Casos que deviam responder e responderam com todos os termos-chave (0 a 1). */
  coverage: number;
  /** Fatos publicados sem nenhuma citação (deve ser 0). */
  unsourced: number;
  /** Fatos não sustentados a cada 100 fatos. */
  hallucinationsPer100: number;
  refusalsCorrect: number;
  refusalsWrong: number;
  /** Latência p95 por caso, em ms. */
  p95: number;
  /** Casos que terminaram em erro do provedor ou do schema. */
  errors: number;
  cases: number;
}

export interface EvalDeps {
  provider?: ModelProvider;
  /** Relógio em ms (padrão `performance.now`); só o teste troca. */
  clock?: () => number;
  /** Corpo do prompt avaliado (a versão vem de `promptVersion`); padrão: o do registro. */
  promptBody?: string;
}

export const EVAL_AGENT = "answer";
/** Fração mínima dos termos de um fato que precisa existir nas fontes citadas. */
export const SUPPORT_THRESHOLD = 0.6;

const NOW = new Date("2026-09-27T18:00:00Z");

/** Percentil por posto mais próximo; lista vazia dá 0. */
export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
  return sorted[Math.min(rank, sorted.length) - 1] ?? 0;
}

const content = (text: string) => textTokens(text).filter((t) => t.length > 3);

/** Um fato é sustentado quando a maior parte de seus termos aparece nas fontes que ele cita. */
function supported(fact: { text: string; citations: number[] }, cited: string): boolean {
  const words = content(fact.text);
  if (words.length === 0) return false;
  const pool = new Set(content(cited));
  const hits = words.filter((w) => pool.has(w)).length;
  return hits / words.length >= SUPPORT_THRESHOLD;
}

const toCandidate = (s: EvalSource): SourceCandidate => ({
  id: s.id,
  kind: "aggregated",
  title: s.title,
  url: `https://${s.publisher}.example.test/${s.id}`,
  sourceName: s.sourceName,
  publisher: s.publisher,
  publishedAt: NOW.toISOString(),
  primary: false,
  sponsored: s.sponsored === true,
  label: { kind: "aggregated", text: "AGREGADO", detail: s.sourceName },
  text: s.text,
});

export async function runRegression(
  input: { agentId: string; promptVersion: number; cases: EvalCase[] },
  deps: EvalDeps = {},
): Promise<EvalMetrics> {
  if (input.agentId !== EVAL_AGENT)
    throw new Error(`Só o agente ${EVAL_AGENT} tem contrato de avaliação.`);
  const clock = deps.clock ?? (() => performance.now());
  const store = createMemoryAiStore();
  const base = await store.agent(EVAL_AGENT);
  const original = store.agent.bind(store);
  store.agent = async (id) => {
    const a = await original(id);
    if (!a || id !== EVAL_AGENT) return a;
    return {
      ...a,
      prompt: { version: input.promptVersion, body: deps.promptBody ?? base?.prompt?.body ?? "" },
    };
  };
  const provider = deps.provider ?? createFakeProvider();
  const callAgent = createCallAgent({ store, provider, now: () => NOW });

  let facts = 0;
  let unsupported = 0;
  let unsourced = 0;
  let expectAnswer = 0;
  let covered = 0;
  let correct = 0;
  let wrong = 0;
  let errors = 0;
  const latencies: number[] = [];

  for (const c of input.cases) {
    const candidates = c.sources.map(toCandidate);
    const t0 = clock();
    const a: AiAnswer = await buildAnswer(c.question, {
      retrieve: async () => (candidates.length > 0 ? ok(candidates) : err("unavailable")),
      callAgent,
      now: () => NOW,
    });
    latencies.push(Math.max(0, clock() - t0));
    if (!c.expect.refuse) expectAnswer += 1;

    if (a.kind === "error") {
      errors += 1;
      if (c.expect.refuse) wrong += 1;
      continue;
    }
    if (a.kind === "insufficient") {
      if (c.expect.refuse) correct += 1;
      else wrong += 1;
      continue;
    }
    if (c.expect.refuse) wrong += 1;
    const byId = new Map(a.sources.map((s, i) => [i, s]));
    let allTerms = true;
    for (const f of a.facts) {
      facts += 1;
      if (f.citations.length === 0) unsourced += 1;
      const cited = f.citations
        .map((i) => byId.get(i))
        .map((s) => c.sources.find((x) => x.id === s?.id))
        .map((s) => (s ? `${s.title} ${s.text}` : ""))
        .join(" ");
      if (!supported(f, cited)) unsupported += 1;
    }
    if (!c.expect.refuse) {
      const said = new Set(a.facts.flatMap((f) => textTokens(f.text)));
      allTerms = (c.expect.keyTerms ?? []).every((t) => said.has(t));
      if (allTerms && a.facts.length > 0) covered += 1;
    }
  }

  return {
    precision: facts > 0 ? (facts - unsupported) / facts : 0,
    coverage: expectAnswer > 0 ? covered / expectAnswer : 1,
    unsourced,
    hallucinationsPer100: facts > 0 ? (unsupported / facts) * 100 : 0,
    refusalsCorrect: correct,
    refusalsWrong: wrong,
    p95: percentile(latencies, 95),
    errors,
    cases: input.cases.length,
  };
}
