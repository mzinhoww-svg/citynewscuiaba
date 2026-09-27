/**
 * Provedor falso (A-018, `AI_PROVIDER=fake`): nenhuma rede, respostas e embeddings estáveis
 * derivados do texto. Testes roteirizam respostas com `script` (inclusive as gravadas em
 * `tests/fixtures/ai/*.json`); sem roteiro, cada agente tem uma resposta padrão que passa no schema.
 */
import { hash64, textTokens } from "@/lib/pipeline/text-features";
import { hashEmbedding } from "./hash-embedding";
import {
  ProviderError,
  type CompletionRequest,
  type EmbeddingRequest,
  type ModelProvider,
} from "./types";

export interface ScriptStep {
  /** Modelo esperado nesta chamada; diferente = violação registrada e erro `provider`. */
  model?: string;
  /** Saída (serializada como JSON). */
  output?: unknown;
  /** Texto cru da resposta (tem precedência sobre `output`). */
  text?: string;
  error?: "timeout" | "provider" | "schema";
}

export interface FakeCall {
  agentId: string;
  modelId: string;
  system: string;
  prompt: string;
  signal?: AbortSignal;
}

type Datum = { id: string; text: string };
type Responder = (data: Datum[], prompt: string) => unknown;

const BLOCK = /<fonte_externa id="([^"]*)">\n([\s\S]*?)\n<\/fonte_externa>/g;

/** Blocos de dados envelopados no prompt, na ordem. */
export function dataBlocks(prompt: string): Datum[] {
  return [...prompt.matchAll(BLOCK)].map((m) => ({ id: m[1] ?? "", text: m[2] ?? "" }));
}

const firstSentence = (text: string, max = 280): string => {
  const s = (/^[\s\S]*?[.!?](?=\s|$)/.exec(text.trim())?.[0] ?? text.trim()).trim();
  return (s || "Sem texto disponível.").slice(0, max);
};

const SECTION_WORDS: [string, string[]][] = [
  [
    "seguranca",
    ["policia", "crime", "preso", "presa", "homicidio", "assalto", "roubo", "tiroteio"],
  ],
  ["saude", ["saude", "vacina", "vacinacao", "hospital", "dengue", "upa", "medico"]],
  ["esportes", ["futebol", "copa", "campeonato", "arena", "jogo", "time", "placar"]],
  ["cultura", ["teatro", "festival", "show", "musica", "exposicao", "siriri", "cururu"]],
  ["clima", ["chuva", "umidade", "fumaca", "calor", "temperatura", "queimada", "seca"]],
  ["politica", ["camara", "vereador", "vereadores", "prefeito", "lei", "eleicao", "deputado"]],
  ["economia", ["preco", "precos", "vendas", "economia", "agro", "juros", "cesta", "negocios"]],
  ["servicos", ["mutirao", "vagas", "atendimento", "inscricoes", "documento"]],
  ["agenda", ["agenda", "programacao", "ingressos"]],
];
const SENSITIVE = ["morte", "morre", "morreu", "homicidio", "acidente", "crime", "suicidio"];

const RESPONDERS: Record<string, Responder> = {
  classify: (data) => {
    const words = textTokens(data.map((d) => d.text).join(" "));
    let section = "cidade";
    let best = 0;
    for (const [slug, keys] of SECTION_WORDS) {
      const n = words.filter((w) => keys.includes(w)).length;
      if (n > best) [section, best] = [slug, n];
    }
    const h = Number(hash64(words.join(" ")) % 50n);
    return {
      section,
      relevance: Math.round((0.5 + h / 100) * 100) / 100,
      sensitive: section === "seguranca" || words.some((w) => SENSITIVE.includes(w)),
      tags: [],
    };
  },
  locate: (data) => {
    const words = textTokens(data.map((d) => d.text).join(" ")).join(" ");
    const municipality = words.includes("varzea grande")
      ? "varzea-grande"
      : words.includes("cuiaba")
        ? "cuiaba"
        : null;
    return { municipality, neighborhood: null, confidence: municipality ? 0.4 : 0 };
  },
  verify: (data) => ({
    mainFact: firstSentence(data[0]?.text ?? "", 400),
    roles: data.map((d) => ({ id: d.id || "item", role: "secondary" })),
    conflict: null,
  }),
  write: (data) => {
    const first = firstSentence(data[0]?.text ?? "");
    const title = first.length >= 10 ? first.slice(0, 140) : `${first} (resumo)`.padEnd(10, ".");
    return {
      title,
      dek: `Resumo de ${data.length} fonte(s) sobre o assunto.`,
      summary: [first],
      body: (data.length > 0 ? data : [{ id: "item", text: first }])
        .slice(0, 12)
        .map((d) => ({ text: firstSentence(d.text, 1200), citations: [d.id || "item"] })),
    };
  },
  answer: (data) => ({
    facts: data.slice(0, 3).map((d, i) => ({ text: firstSentence(d.text, 500), citations: [i] })),
    inferences: [],
    gaps: [],
    conflicts: [],
  }),
  // Resumo determinístico que nunca copia a fonte: palavras-chave soltas numa frase fixa.
  aggregate_summary: (data) => {
    const seen = new Set<string>();
    const keys = textTokens(data.map((d) => d.text).join(" "))
      .filter((w) => w.length > 4 && !seen.has(w) && seen.add(w))
      .slice(0, 4);
    const list =
      keys.length > 1 ? `${keys.slice(0, -1).join(", ")} e ${keys.at(-1)}` : (keys[0] ?? "o fato");
    return {
      summary: `Resumo do CityNews: a reportagem trata de ${list}. Detalhes no site do veículo.`,
    };
  },
  image: () => ({
    allowed: false,
    reason: "O provedor falso não gera imagens.",
    prompt: "",
    alt: "",
  }),
};

const tokens = (s: string) => Math.max(1, Math.ceil(s.length / 4));

export function createFakeProvider(opts: { embeddingDim?: number } = {}) {
  const queue: ScriptStep[] = [];
  const calls: FakeCall[] = [];
  const embedCalls: { modelId: string; texts: string[]; dimensions: number }[] = [];
  const violations: string[] = [];

  const respond = (req: CompletionRequest): string => {
    const step = queue.shift();
    if (step?.model !== undefined && step.model !== req.modelId) {
      const msg = `roteiro esperava ${step.model}, chamada usou ${req.modelId}`;
      violations.push(msg);
      throw new ProviderError("provider", msg);
    }
    if (step?.error) throw new ProviderError(step.error, `falha roteirizada: ${step.error}`);
    if (step?.text !== undefined) return step.text;
    if (step && "output" in step) return JSON.stringify(step.output);
    const responder = RESPONDERS[req.agentId];
    if (!responder)
      throw new ProviderError("provider", `agente sem resposta falsa: ${req.agentId}`);
    return JSON.stringify(responder(dataBlocks(req.prompt), req.prompt));
  };

  return {
    kind: "fake" as const,
    async complete(req: CompletionRequest) {
      calls.push({
        agentId: req.agentId,
        modelId: req.modelId,
        system: req.system,
        prompt: req.prompt,
        signal: req.signal,
      });
      req.signal.throwIfAborted();
      const text = respond(req);
      return { text, tokensIn: tokens(req.system + req.prompt), tokensOut: tokens(text) };
    },
    async embed(req: EmbeddingRequest) {
      embedCalls.push({ modelId: req.modelId, texts: req.texts, dimensions: req.dimensions });
      const dim = opts.embeddingDim ?? req.dimensions;
      return {
        vectors: req.texts.map((t) => hashEmbedding(t, dim)),
        tokensIn: req.texts.reduce((s, t) => s + tokens(t), 0),
      };
    },
    /** Próximas respostas, na ordem das chamadas (cada tentativa consome um passo). */
    script(steps: ScriptStep[]) {
      queue.push(...steps);
    },
    calls,
    embedCalls,
    violations,
    get lastPrompt(): string {
      return calls.at(-1)?.prompt ?? "";
    },
    get lastSystem(): string {
      return calls.at(-1)?.system ?? "";
    },
  } satisfies ModelProvider & Record<string, unknown>;
}

export type FakeProvider = ReturnType<typeof createFakeProvider>;
