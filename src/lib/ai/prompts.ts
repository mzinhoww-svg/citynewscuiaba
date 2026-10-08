/**
 * Prompts versionados e playground (P5-T5, telas O12 e O15). Regras puras: alvo de aprovação,
 * transições de estado, versão seguinte, diff por palavra (reusa o diff do Estúdio, P4) e a
 * rodada do playground sobre um `callAgent` injetado (o de produção nas telas, o provedor falso
 * nos testes e no CI). Acesso ao banco fica em `src/lib/studio/ai-prompts.ts` e nas migrations
 * 0036 (`prompt_publish`, `prompt_rollback`). Só servidor: o playground usa os schemas zod.
 */
import "server-only";
import type { z } from "zod";
import { sanitizeExternalText } from "@/lib/security/sanitize";
import type { CallAgent } from "./call-agent";
import { AGENT_SCHEMAS } from "./schemas";
import type { AgentId, AiError } from "./types";

// Regras puras em módulo próprio, sem zod (as telas cliente importam de lá; item 85, A-156).
export * from "./prompts-constants";

// ---------------------------------------------------------------------------
// Playground (O15)
// ---------------------------------------------------------------------------

export interface PlaygroundInput {
  agentId: AgentId;
  task: string;
  data: { id: string; text: string }[];
  /** Contexto extra da etapa (vai depois do prompt do agente). */
  system?: string;
}

export interface PlaygroundResult {
  sanitizedInput: { id: string; text: string; injection: boolean }[];
  /** Saída estruturada validada pelo schema do agente (`null` quando inválida ou recusada). */
  output: unknown;
  valid: boolean;
  error: AiError | null;
  costBrl: number;
  latencyMs: number;
}

export interface PlaygroundDeps {
  callAgent: CallAgent;
  /** Chamadas registradas nesta rodada (custo e latência somados). */
  calls: () => { costBrl: number; latencyMs: number }[];
}

/** Limite de caracteres por bloco, o mesmo do `callAgent`. */
const MAX_DATA_CHARS = 6000;

/**
 * Roda um agente com entrada colada. Nunca grava nada além de `ai_calls` (quem chama decide o
 * registro); a entrada sanitizada volta para a tela mostrar o que o modelo viu.
 */
export async function playgroundRun(
  input: PlaygroundInput,
  deps: PlaygroundDeps,
): Promise<PlaygroundResult> {
  const sanitizedInput = input.data.map((d) => {
    const s = sanitizeExternalText(d.text, MAX_DATA_CHARS);
    return { id: d.id, text: s.text, injection: s.injection };
  });
  const schema: z.ZodType = AGENT_SCHEMAS[input.agentId];
  const r = await deps.callAgent(
    input.agentId,
    { system: input.system ?? "", data: input.data, task: input.task },
    schema,
  );
  const calls = deps.calls();
  const costBrl = calls.reduce((s, c) => s + c.costBrl, 0);
  const latencyMs = calls.reduce((s, c) => s + c.latencyMs, 0);
  return {
    sanitizedInput,
    output: r.ok ? r.value : null,
    valid: r.ok,
    error: r.ok ? null : r.error,
    costBrl: Math.round(costBrl * 1_000_000) / 1_000_000,
    latencyMs,
  };
}
