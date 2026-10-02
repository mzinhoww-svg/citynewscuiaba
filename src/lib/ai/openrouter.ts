import "server-only";
import { DEFAULT_EMBEDDING_DIM } from "./config";
import { ProviderError, type ModelProvider } from "./types";

export interface OpenRouterConfig {
  apiKey: string;
  baseURL: string;
  /** Cabeçalhos de atribuição do OpenRouter. */
  referer: string;
  title: string;
  /** `fetch` injetável (testes nunca acessam a rede). */
  fetch?: typeof fetch;
}

export const DEFAULT_OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

/** Configuração a partir do ambiente; `null` sem `OPENROUTER_API_KEY`. */
export function openRouterConfigFromEnv(
  env: Record<string, string | undefined> = process.env,
): OpenRouterConfig | null {
  if (!env.OPENROUTER_API_KEY) return null;
  return {
    apiKey: env.OPENROUTER_API_KEY,
    baseURL: env.OPENROUTER_BASE_URL || DEFAULT_OPENROUTER_BASE_URL,
    referer: env.APP_URL || "https://citynewscuiaba.vercel.app",
    title: "CityNews Cuiabá",
  };
}

/**
 * OpenRouter via Vercel AI SDK com provedor compatível com OpenAI (ADR-005, A-005): chat em
 * `POST /chat/completions` (modo JSON) e embeddings em `POST /embeddings`. O SDK é carregado sob
 * demanda: nada de IA entra no bundle de páginas públicas. Sem novas tentativas no SDK: o
 * fallback de modelo é do `callAgent`.
 */
export function createOpenRouterProvider(cfg: OpenRouterConfig): ModelProvider {
  const sdk = (async () => {
    const [ai, compat] = await Promise.all([import("ai"), import("@ai-sdk/openai-compatible")]);
    const provider = compat.createOpenAICompatible({
      name: "openrouter",
      baseURL: cfg.baseURL,
      apiKey: cfg.apiKey,
      headers: { "HTTP-Referer": cfg.referer, "X-Title": cfg.title },
      includeUsage: true,
      ...(cfg.fetch ? { fetch: cfg.fetch } : {}),
    });
    return { ai, provider };
  })();

  return {
    kind: "openrouter",

    async complete(req) {
      const { ai, provider } = await sdk;
      try {
        const res = await ai.generateText({
          model: provider.chatModel(req.modelId),
          system: req.system,
          prompt: req.prompt,
          output: ai.Output.json(),
          maxRetries: 0,
          abortSignal: req.signal,
          // Modelos de raciocínio gastam max_tokens pensando e devolvem JSON vazio; a tarefa é
          // extração estruturada, não precisa. Modelos sem raciocínio ignoram o campo.
          providerOptions: { openrouter: { reasoning: { enabled: false } } },
          ...(req.maxTokens !== null ? { maxOutputTokens: req.maxTokens } : {}),
          ...(req.temperature !== null ? { temperature: req.temperature } : {}),
        });
        return {
          text: res.text,
          tokensIn: res.usage.inputTokens ?? 0,
          tokensOut: res.usage.outputTokens ?? 0,
        };
      } catch (e) {
        if (ai.NoObjectGeneratedError.isInstance(e))
          throw new ProviderError("schema", "resposta sem JSON válido");
        throw e;
      }
    },

    async embed(req) {
      const { ai, provider } = await sdk;
      const res = await ai.embedMany({
        model: provider.embeddingModel(req.modelId),
        values: req.texts,
        maxRetries: 0,
        abortSignal: req.signal,
        ...(req.dimensions !== DEFAULT_EMBEDDING_DIM
          ? { providerOptions: { openrouter: { dimensions: req.dimensions } } }
          : {}),
      });
      return { vectors: res.embeddings.map((v) => [...v]), tokensIn: res.usage.tokens };
    },
  };
}
