/**
 * Registro de IA: regras puras sobre agentes, modelos e orçamento (ADR-005, A-005, A-006, A-018).
 * Os dados (modelos, agentes, prompts aprovados) ficam em `ai_models`, `ai_agents`, `ai_prompts`.
 */
import type { AiModel } from "./types";

/** Orçamento global de IA por dia (A-006): em 100% toda chamada é recusada. */
export const GLOBAL_DAILY_BUDGET_BRL = 30;

/** Tempo máximo de uma chamada por agente (o fallback tem o mesmo limite). */
export const AGENT_TIMEOUT_MS: Record<string, number> = {
  classify: 20_000,
  locate: 20_000,
  verify: 30_000,
  write: 45_000,
  answer: 25_000,
  image: 20_000,
  aggregate_summary: 15_000,
  embed: 15_000,
};
export const DEFAULT_TIMEOUT_MS = 20_000;

/** Cuiabá está em UTC−4 o ano todo (sem horário de verão desde 2019). */
const CUIABA_OFFSET_MS = -4 * 3600_000;

/** Início do dia corrente em Cuiabá, em UTC (o orçamento zera à meia-noite de Cuiabá). */
export function dayStartCuiaba(now: Date): Date {
  const local = now.getTime() + CUIABA_OFFSET_MS;
  const dayLocal = Math.floor(local / 86_400_000) * 86_400_000;
  return new Date(dayLocal - CUIABA_OFFSET_MS);
}

/** Custo em R$ de uma chamada (preços de `ai_models` por 1 000 tokens). */
export function costBrl(model: AiModel, tokensIn: number, tokensOut: number): number {
  const cost = (tokensIn / 1000) * model.costPer1kIn + (tokensOut / 1000) * model.costPer1kOut;
  return Math.round(cost * 1_000_000) / 1_000_000;
}

export type ProviderKind = "openrouter" | "fake";

/**
 * Provedor em uso (A-018): OpenRouter só com `OPENROUTER_API_KEY`; sem a chave, ou com
 * `AI_PROVIDER=fake`, o provedor falso determinístico.
 */
export function resolveProviderKind(env: Record<string, string | undefined>): ProviderKind {
  if (env.AI_PROVIDER === "fake") return "fake";
  return env.OPENROUTER_API_KEY ? "openrouter" : "fake";
}
