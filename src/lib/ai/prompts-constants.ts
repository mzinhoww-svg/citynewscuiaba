/**
 * Regras puras dos prompts versionados (P5-T5, telas O12 e O15), sem zod: alvo de aprovação,
 * transições de estado, versão seguinte, diff por palavra e orçamentos. As telas do Estúdio
 * importam daqui; o playground (com os schemas zod dos agentes) fica em `./prompts`, só servidor
 * (item 85, A-156).
 */
import { diffText, type DiffOp } from "@/lib/studio/diff";
import { AGENT_IDS, type AgentId } from "./types";

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
