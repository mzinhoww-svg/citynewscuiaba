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

/**
 * Marcador de teste: pergunta ou dado com este texto faz o provedor falso falhar por tempo
 * esgotado (e2e do fallback da busca com IA, docs/testing.md §2 item 6). O OpenRouter o ignora.
 */
export const FAKE_TIMEOUT_MARKER = "[teste:tempo-esgotado]";

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
  // Revisor automático: o provedor falso nunca publica nem arquiva sozinho.
  reviewer: () => ({
    verdict: "hold",
    reason: "Provedor falso: mantida para uma pessoa decidir.",
  }),
  // Texto do Guia que cita cada lugar pelo nome do bloco, sem número: passa na conferência.
  guide_writer: (data) => {
    const names = data.map((d) => /^Nome: (.+)$/m.exec(d.text)?.[1]?.trim() || d.id);
    const article = [
      "Esta lista reúne lugares de Cuiabá bem avaliados pelos clientes, na ordem em que aparecem abaixo, com o que cada um tem de bom.",
      ...names.map(
        (n) => `${n} é uma das escolhas da lista, lembrada pelos clientes pelo atendimento.`,
      ),
      "Endereço, telefone, horário e o link de cada lugar estão logo abaixo, na ordem da lista.",
      "A nota e o número de avaliações de cada lugar aparecem junto do nome, com a fonte do dado.",
    ].join("\n\n");
    return {
      article,
      notes: data.map((d, i) => ({
        id: d.id,
        note: `${names[i]} aparece entre os lugares mais bem avaliados da lista.`,
      })),
    };
  },
  // Resposta fixa que passa no schema estrito; com `estrutura` enviada, também sugere seletores.
  source_profiler: (data) => ({
    categories: ["cidade"],
    locality: "cuiaba",
    localityConfidence: 0.8,
    qualityFlags: [],
    pageSelectors: data.some((d) => d.id === "estrutura")
      ? { item: "article.card", link: "a", title: "h2", date: "time" }
      : null,
    rationale: "Amostra fictícia.",
  }),
  // Extrator de eventos: `listagem` devolve os href absolutos `/evento/...` do bloco; `pagina` lê
  // as linhas `cn-data:`, `cn-hora:`, `cn-local:` (o saneamento remove atributos HTML, então os
  // marcadores da fixture viram texto) e usa a 1ª linha como título.
  event_extractor: (data) => {
    const listing = data.find((d) => d.id === "listagem");
    if (listing) {
      const links = [...listing.text.matchAll(/https?:\/\/[^\s()]+\/evento\/[^\s()]*/g)].map(
        (m) => m[0],
      );
      return { links: [...new Set(links)].slice(0, 30) };
    }
    return fakeEventPage(data.find((d) => d.id === "pagina")?.text ?? "");
  },
};

const MONTHS = [
  "janeiro",
  "fevereiro",
  "marco",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

function fakeEventPage(text: string) {
  const lines = text.split("\n").map((l) => l.trim());
  const marked = (key: string) => {
    const l = lines.find((x) => x.toLowerCase().startsWith(`cn-${key}:`));
    return l ? l.slice(key.length + 4).trim() : null;
  };
  const field = (value: string, trecho = value) => ({
    value,
    trecho: trecho.length >= 3 ? trecho : `${trecho}   `,
    ano_evidencia: /\b\d{4}\b/.test(trecho) ? ("corpo" as const) : ("ausente" as const),
  });
  const title = lines.find((l) => l && !/^cn-/i.test(l)) ?? "Sem evento";
  const rawDate = marked("data");
  let iso = "1970-01-01";
  if (rawDate) {
    const folded = rawDate
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase();
    const num = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(folded);
    const txt = /(\d{1,2}) de ([a-z]+)(?: de (\d{4}))?/.exec(folded);
    const pad = (n: number | string) => String(n).padStart(2, "0");
    if (num) iso = `${num[3]}-${pad(num[2]!)}-${pad(num[1]!)}`;
    else if (txt) {
      const m = MONTHS.indexOf(txt[2]!) + 1;
      iso = `${txt[3] ?? "1970"}-${pad(m || 1)}-${pad(txt[1]!)}`;
    }
  }
  const rawHour = marked("hora");
  const hm = rawHour ? /(\d{1,2})\s*(?:h|:)\s*(\d{2})?/i.exec(rawHour) : null;
  const rawPlace = marked("local");
  const rawOrganizer = marked("organizador");
  const rawAge = marked("faixa");
  return {
    evento: rawDate !== null,
    titulo: field(title),
    data: field(iso, rawDate ?? "sem data"),
    horario:
      rawHour && hm
        ? { ...field(`${String(hm[1]).padStart(2, "0")}:${hm[2] ?? "00"}`, rawHour) }
        : null,
    local: rawPlace ? field(rawPlace) : null,
    cidade: null,
    preco: null,
    organizador: rawOrganizer ? field(rawOrganizer) : null,
    faixa: rawAge ? field(rawAge) : null,
    relativas: [] as string[],
  };
}

const tokens = (s: string) => Math.max(1, Math.ceil(s.length / 4));

export function createFakeProvider(opts: { embeddingDim?: number } = {}) {
  const queue: ScriptStep[] = [];
  const calls: FakeCall[] = [];
  const embedCalls: { modelId: string; texts: string[]; dimensions: number }[] = [];
  const violations: string[] = [];

  const respond = (req: CompletionRequest): string => {
    if (req.prompt.includes(FAKE_TIMEOUT_MARKER))
      throw new ProviderError("timeout", "tempo esgotado simulado");
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
