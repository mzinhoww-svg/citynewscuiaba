/**
 * Prompts versionados e playground (P5-T5, telas O12 e O15). Regras puras: alvo de aprovação,
 * transições de estado, versão seguinte, diff por palavra (reusa o diff do Estúdio, P4) e a
 * rodada do playground sobre um `callAgent` injetado (o de produção nas telas, o provedor falso
 * nos testes e no CI). Acesso ao banco fica em `src/lib/studio/ai-prompts.ts` e nas migrations
 * 0036 (`prompt_publish`, `prompt_rollback`).
 */
import type { z } from "zod";
import { diffText, type DiffOp } from "@/lib/studio/diff";
import { sanitizeExternalText } from "@/lib/security/sanitize";
import type { CallAgent } from "./call-agent";
import { AGENT_SCHEMAS } from "./schemas";
import { AGENT_IDS, type AgentId, type AiError } from "./types";

export const PROMPT_STATUSES = ["draft", "pending", "production", "archived", "reverted"] as const;
export type PromptStatus = (typeof PROMPT_STATUSES)[number];

export const isAgentId = (v: string): v is AgentId => (AGENT_IDS as readonly string[]).includes(v);
export const isPromptStatus = (v: string): v is PromptStatus =>
  (PROMPT_STATUSES as readonly string[]).includes(v);

/** Alvo do pedido `prompt.publish` em `approvals.target_ref`. */
export const promptTarget = (agentId: string, version: number): string =>
  `prompt:${agentId}:${version}`;

const TARGET = /^prompt:([a-z_]+):(\d+)$/;

export function parsePromptTarget(ref: string): { agentId: string; version: number } | null {
  const m = TARGET.exec(ref);
  return m ? { agentId: m[1]!, version: Number(m[2]) } : null;
}

/** Versão seguinte de um agente (1 sem versões). */
export function nextPromptVersion(versions: { version: number }[]): number {
  return versions.reduce((max, v) => Math.max(max, v.version), 0) + 1;
}

/** Diferença por palavra entre dois prompts (reusa `diffText` de P4 T4). */
export function diffPrompt(a: string, b: string): DiffOp[] {
  return diffText(a, b);
}

/**
 * Transições de estado de uma versão: rascunho → pendente (pedido de publicação) → produção
 * (aprovação de admin ou editor-chefe, que pode ser quem pediu, A-128). Produção só sai para arquivada (nova versão publicada) ou
 * revertida (rollback); versão decidida nunca volta a rascunho.
 */
const TRANSITIONS: Record<PromptStatus, readonly PromptStatus[]> = {
  draft: ["pending", "production"],
  pending: ["draft", "production"],
  production: ["archived", "reverted"],
  archived: [],
  reverted: [],
};

export function transitionAllowed(from: PromptStatus, to: PromptStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/** Versões para as quais dá para voltar: já estiveram em produção, mais recentes primeiro. */
export function rollbackTargets<T extends { version: number; status: string }>(versions: T[]): T[] {
  return versions
    .filter((v) => v.status === "archived" || v.status === "reverted")
    .sort((a, b) => b.version - a.version);
}

/** Orçamentos por agente: nenhum negativo e a soma dentro do teto global (A-006, A-056). */
export function budgetsValid(
  agents: { id: string; dailyBudgetBrl: number }[],
  globalBudgetBrl: number,
): { ok: boolean; sum: number } {
  const sum = Math.round(agents.reduce((s, a) => s + a.dailyBudgetBrl, 0) * 100) / 100;
  const ok =
    agents.every((a) => Number.isFinite(a.dailyBudgetBrl) && a.dailyBudgetBrl >= 0) &&
    sum <= globalBudgetBrl + 1e-9;
  return { ok, sum };
}

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
