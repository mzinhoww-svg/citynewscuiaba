import "server-only";
import { createServiceClient } from "@/lib/db/client";
import { createAiStore } from "@/lib/db/ai-store";
import { err, ok } from "@/lib/result";
import { createCallAgent, createEmbedder, type CallAgent, type Embedder } from "./call-agent";
import { createFakeProvider } from "./fake";
import { createOpenRouterProvider, openRouterConfigFromEnv } from "./openrouter";
import { resolveProviderKind, type ProviderKind } from "./registry";
import type { ModelProvider } from "./types";

export interface ProductionAi {
  providerKind: ProviderKind;
  callAgent: CallAgent;
  embed: Embedder;
  /** Embedding de um texto no formato da porta `Embed` do pipeline. */
  embedOne: (
    text: string,
    opts?: { signal?: AbortSignal },
  ) => Promise<{ ok: true; value: number[] } | { ok: false; error: string }>;
  /** Versão do prompt em produção do agente (idempotência das etapas). */
  promptVersion: (agentId: string) => Promise<number | null>;
}

/**
 * Camada de IA de produção (rotas de servidor do pipeline e da busca). Criada sob demanda: importar
 * este módulo não lê ambiente nem abre conexão. Sem `OPENROUTER_API_KEY`, provedor falso (A-018).
 */
export function createProductionAi(): ProductionAi {
  const providerKind = resolveProviderKind(process.env);
  const config = openRouterConfigFromEnv();
  const provider: ModelProvider =
    providerKind === "openrouter" && config
      ? createOpenRouterProvider(config)
      : createFakeProvider();
  const store = createAiStore(createServiceClient());
  const deps = { store, provider, now: () => new Date() };
  const embed = createEmbedder(deps);
  return {
    providerKind: provider.kind,
    callAgent: createCallAgent(deps),
    embed,
    embedOne: async (text, opts) => {
      const r = await embed([text], opts);
      if (!r.ok) return err(r.error);
      const v = r.value[0];
      return v ? ok(v) : err("schema");
    },
    promptVersion: async (agentId) => (await store.agent(agentId))?.prompt?.version ?? null,
  };
}
