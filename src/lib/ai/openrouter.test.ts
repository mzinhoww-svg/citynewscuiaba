// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createOpenRouterProvider, openRouterConfigFromEnv } from "./openrouter";
import { ProviderError } from "./types";

interface Seen {
  url: string;
  headers: Headers;
  body: Record<string, unknown>;
}

/** `fetch` falso com respostas no formato da API do OpenRouter (nenhuma rede). */
function fakeFetch(respond: (s: Seen) => unknown) {
  const seen: Seen[] = [];
  const f: typeof fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const s: Seen = {
      url,
      headers: new Headers(init?.headers),
      body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>,
    };
    seen.push(s);
    return new Response(JSON.stringify(respond(s)), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  return { f, seen };
}

const chat = (content: string) => ({
  id: "gen-1",
  object: "chat.completion",
  created: 1,
  model: "google/gemini-2.5-flash",
  choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
  usage: { prompt_tokens: 120, completion_tokens: 30, total_tokens: 150 },
});

const cfg = {
  apiKey: "sk-teste",
  baseURL: "https://openrouter.ai/api/v1",
  referer: "https://citynewscuiaba.vercel.app",
  title: "CityNews Cuiabá",
};

describe("provedor OpenRouter (sem rede)", () => {
  it("chat em /chat/completions com cabeçalhos de atribuição, modo JSON e uso de tokens", async () => {
    const { f, seen } = fakeFetch(() => chat('{"section":"cidade"}'));
    const p = createOpenRouterProvider({ ...cfg, fetch: f });
    const r = await p.complete({
      agentId: "classify",
      modelId: "google/gemini-2.5-flash",
      system: "sistema",
      prompt: "tarefa",
      maxTokens: 256,
      temperature: 0.2,
      signal: new AbortController().signal,
    });
    expect(r).toEqual({ text: '{"section":"cidade"}', tokensIn: 120, tokensOut: 30 });
    const s = seen[0]!;
    expect(s.url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(s.headers.get("authorization")).toBe("Bearer sk-teste");
    expect(s.headers.get("http-referer")).toBe("https://citynewscuiaba.vercel.app");
    expect(s.headers.get("x-title")).toBe("CityNews Cuiabá");
    expect(s.body).toMatchObject({
      model: "google/gemini-2.5-flash",
      max_tokens: 256,
      temperature: 0.2,
      response_format: { type: "json_object" },
    });
  });

  it("embeddings em /embeddings; dimensão só é enviada quando difere de 1536", async () => {
    const { f, seen } = fakeFetch((s) => ({
      object: "list",
      data: (s.body.input as string[]).map((_, i) => ({
        object: "embedding",
        index: i,
        embedding: [0.1, 0.2, 0.3],
      })),
      model: "openai/text-embedding-3-small",
      usage: { prompt_tokens: 7, total_tokens: 7 },
    }));
    const p = createOpenRouterProvider({ ...cfg, fetch: f });
    const signal = new AbortController().signal;
    const r = await p.embed({
      modelId: "openai/text-embedding-3-small",
      texts: ["a", "b"],
      dimensions: 3,
      signal,
    });
    expect(r).toEqual({
      vectors: [
        [0.1, 0.2, 0.3],
        [0.1, 0.2, 0.3],
      ],
      tokensIn: 7,
    });
    expect(seen[0]!.url).toBe("https://openrouter.ai/api/v1/embeddings");
    expect(seen[0]!.body).toMatchObject({ model: "openai/text-embedding-3-small", dimensions: 3 });
    await p.embed({ modelId: "m", texts: ["a"], dimensions: 1536, signal });
    expect(seen[1]!.body).not.toHaveProperty("dimensions");
  });

  it("resposta sem JSON vira ProviderError schema", async () => {
    const { f } = fakeFetch(() => chat("não é JSON"));
    const p = createOpenRouterProvider({ ...cfg, fetch: f });
    const r = p.complete({
      agentId: "classify",
      modelId: "m",
      system: "s",
      prompt: "p",
      maxTokens: null,
      temperature: null,
      signal: new AbortController().signal,
    });
    await expect(r).rejects.toMatchObject({ kind: "schema" });
    await r.catch((e: unknown) => expect(e).toBeInstanceOf(ProviderError));
  });

  it("configuração do ambiente: sem chave não há OpenRouter", () => {
    expect(openRouterConfigFromEnv({})).toBeNull();
    expect(openRouterConfigFromEnv({ OPENROUTER_API_KEY: "k" })).toMatchObject({
      baseURL: "https://openrouter.ai/api/v1",
      title: "CityNews Cuiabá",
    });
    expect(
      openRouterConfigFromEnv({ OPENROUTER_API_KEY: "k", OPENROUTER_BASE_URL: "http://x/v1" }),
    ).toMatchObject({ baseURL: "http://x/v1" });
  });
});
