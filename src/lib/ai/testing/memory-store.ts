import { DEFAULT_AGENTS, DEFAULT_MODELS } from "../defaults";
import type { AgentConfig, AiCallRow, AiModel, AiStore } from "../types";

const testModel = (id: string): AiModel => ({
  id,
  maxTokens: 1024,
  temperature: 0,
  costPer1kIn: 0.001,
  costPer1kOut: 0.004,
  active: true,
});

/**
 * Registro de IA em memória com os agentes padrão (só testes). `models` troca o modelo principal
 * e o fallback de todos os agentes de texto (ex.: "A" e "C" nos testes de fallback).
 */
export function createMemoryAiStore(
  opts: { models?: { primary: string; fallback: string | null } } = {},
) {
  const models = new Map(DEFAULT_MODELS.map((m) => [m.id, m]));
  const agents = new Map<string, AgentConfig>();
  for (const a of DEFAULT_AGENTS) {
    const primary = a.prompt && opts.models ? opts.models.primary : a.model;
    const fallback = a.prompt && opts.models ? opts.models.fallback : a.fallback;
    agents.set(a.id, {
      id: a.id,
      enabled: true,
      dailyBudgetBrl: a.dailyBudgetBrl,
      model: models.get(primary) ?? testModel(primary),
      fallback: fallback ? (models.get(fallback) ?? testModel(fallback)) : null,
      prompt: a.prompt ? { version: 1, body: a.prompt } : null,
    });
  }
  const calls: AiCallRow[] = [];
  const spend: { agentId: string; brl: number; at: number }[] = [];
  let enabled = true;
  let clock = 0;

  const store: AiStore = {
    async agent(id) {
      const a = agents.get(id);
      return a ? { ...a } : null;
    },
    async aiEnabled() {
      return enabled;
    },
    async spendSince(since) {
      const out: Record<string, number> = {};
      for (const s of spend)
        if (s.at >= since.getTime()) out[s.agentId] = (out[s.agentId] ?? 0) + s.brl;
      return out;
    },
    async recordCall(row) {
      calls.push(row);
      // Chamadas registradas contam no gasto "agora" (relógio lógico após qualquer gasto manual).
      spend.push({ agentId: row.agent_id, brl: row.cost_brl, at: Math.max(clock, Date.now()) });
    },
  };

  return Object.assign(store, {
    calls,
    addSpend(agentId: string, brl: number, at: Date) {
      clock = Math.max(clock, at.getTime());
      spend.push({ agentId, brl, at: at.getTime() });
    },
    setAiEnabled(v: boolean) {
      enabled = v;
    },
    setAgentEnabled(id: string, v: boolean) {
      const a = agents.get(id);
      if (a) a.enabled = v;
    },
  });
}

export type MemoryAiStore = ReturnType<typeof createMemoryAiStore>;
