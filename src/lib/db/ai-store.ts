import "server-only";
import type { AgentConfig, AiModel, AiStore } from "@/lib/ai/types";
import type { DbClient } from "./client";

function check(op: string, error: { message: string } | null): void {
  if (error) throw new Error(`ai-store: ${op}: ${error.message}`);
}

/** Agentes e flag mudam pouco: cache curto evita três consultas por chamada no drain. */
const CACHE_MS = 60_000;

/** Registro de IA no banco (service role): `ai_agents`, `ai_models`, `ai_prompts`, `ai_calls`. */
export function createAiStore(db: DbClient, now: () => number = () => Date.now()): AiStore {
  const agents = new Map<string, { at: number; value: AgentConfig | null }>();
  let flag: { at: number; value: boolean } | null = null;

  const toModel = (m: {
    id: string;
    max_tokens: number | null;
    temperature: number | null;
    cost_per_1k_in: number | null;
    cost_per_1k_out: number | null;
    status: string;
  }): AiModel => ({
    id: m.id,
    maxTokens: m.max_tokens,
    temperature: m.temperature,
    costPer1kIn: Number(m.cost_per_1k_in ?? 0),
    costPer1kOut: Number(m.cost_per_1k_out ?? 0),
    active: m.status === "active",
  });

  async function load(id: string): Promise<AgentConfig | null> {
    const { data: a, error } = await db
      .from("ai_agents")
      .select("id, model_id, fallback_model_id, prompt_version, daily_budget_brl, enabled")
      .eq("id", id)
      .maybeSingle();
    check("agent", error);
    if (!a) return null;
    const ids = [a.model_id, a.fallback_model_id].filter((x): x is string => x !== null);
    const models = await db
      .from("ai_models")
      .select("id, max_tokens, temperature, cost_per_1k_in, cost_per_1k_out, status")
      .in("id", ids);
    check("models", models.error);
    const byId = new Map((models.data ?? []).map((m) => [m.id, toModel(m)]));
    const model = byId.get(a.model_id);
    if (!model) return null;
    let prompt: AgentConfig["prompt"] = null;
    if (a.prompt_version !== null) {
      const p = await db
        .from("ai_prompts")
        .select("version, body")
        .eq("agent_id", id)
        .eq("version", a.prompt_version)
        .eq("status", "production")
        .maybeSingle();
      check("prompt", p.error);
      prompt = p.data ? { version: p.data.version, body: p.data.body } : null;
    }
    return {
      id: a.id,
      enabled: a.enabled,
      dailyBudgetBrl: Number(a.daily_budget_brl),
      model,
      fallback: a.fallback_model_id ? (byId.get(a.fallback_model_id) ?? null) : null,
      prompt,
    };
  }

  return {
    async agent(id) {
      const hit = agents.get(id);
      if (hit && now() - hit.at < CACHE_MS) return hit.value;
      const value = await load(id);
      agents.set(id, { at: now(), value });
      return value;
    },

    async aiEnabled() {
      if (flag && now() - flag.at < CACHE_MS) return flag.value;
      const { data, error } = await db
        .from("feature_flags")
        .select("enabled")
        .eq("key", "ai_enabled")
        .maybeSingle();
      check("aiEnabled", error);
      // Sem a flag cadastrada, IA fica desligada (falha fechado).
      flag = { at: now(), value: data?.enabled === true };
      return flag.value;
    },

    async spendSince(since) {
      const { data, error } = await db.rpc("ai_spend_since", { p_since: since.toISOString() });
      check("spendSince", error);
      const out: Record<string, number> = {};
      for (const r of data ?? []) out[r.agent_id] = Number(r.cost_brl);
      return out;
    },

    async recordCall(row) {
      const { error } = await db.from("ai_calls").insert({
        ...row,
        error: row.error === null ? null : row.error.slice(0, 500),
      });
      check("recordCall", error);
    },
  };
}
