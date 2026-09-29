import "server-only";
import type { DbClient } from "@/lib/db/client";
import { isPromptStatus, type PromptStatus } from "@/lib/ai/prompts";
import { studioContext } from "@/lib/studio/context";

/*
 * Leituras de agentes, modelos e prompts (O10, O11, O12, O15) com a sessão da pessoa
 * (`ai_*_read_staff`: toda a equipe lê).
 */

function check(what: string, error: { message: string } | null): void {
  if (error) throw new Error(`ia ${what}: ${error.message}`);
}
const num = (v: unknown): number => (typeof v === "number" ? v : Number(v ?? 0) || 0);

export interface AgentRow {
  id: string;
  fn: string;
  enabled: boolean;
  modelId: string;
  fallbackModelId: string | null;
  promptVersion: number | null;
  /** Versão realmente em produção em `ai_prompts` (pode divergir de `prompt_version`). */
  productionVersion: number | null;
  dailyBudgetBrl: number;
}

export interface ModelRow {
  id: string;
  name: string;
  provider: string;
  version: string;
  maxTokens: number | null;
  temperature: number | null;
  costPer1kIn: number;
  costPer1kOut: number;
  active: boolean;
  usedBy: string[];
}

export async function agentsOverview(
  db?: DbClient,
): Promise<{ agents: AgentRow[]; models: ModelRow[] }> {
  const client = db ?? (await studioContext()).db;
  const [agents, models, prods] = await Promise.all([
    client
      .from("ai_agents")
      .select(
        "id, function, enabled, model_id, fallback_model_id, prompt_version, daily_budget_brl",
      )
      .order("id"),
    client
      .from("ai_models")
      .select(
        "id, name, provider, version, max_tokens, temperature, cost_per_1k_in, cost_per_1k_out, status",
      )
      .order("id"),
    client.from("ai_prompts").select("agent_id, version").eq("status", "production"),
  ]);
  check("agents", agents.error);
  check("models", models.error);
  check("prompts", prods.error);
  const production = new Map((prods.data ?? []).map((p) => [p.agent_id, p.version]));
  const rows = agents.data ?? [];
  return {
    agents: rows.map((a) => ({
      id: a.id,
      fn: a.function,
      enabled: a.enabled,
      modelId: a.model_id,
      fallbackModelId: a.fallback_model_id,
      promptVersion: a.prompt_version,
      productionVersion: production.get(a.id) ?? null,
      dailyBudgetBrl: num(a.daily_budget_brl),
    })),
    models: (models.data ?? []).map((m) => ({
      id: m.id,
      name: m.name,
      provider: m.provider,
      version: m.version,
      maxTokens: m.max_tokens,
      temperature: m.temperature,
      costPer1kIn: num(m.cost_per_1k_in),
      costPer1kOut: num(m.cost_per_1k_out),
      active: m.status === "active",
      usedBy: rows
        .filter((a) => a.model_id === m.id || a.fallback_model_id === m.id)
        .map((a) => a.id),
    })),
  };
}

export interface PromptVersionRow {
  id: string;
  agentId: string;
  version: number;
  status: PromptStatus;
  body: string;
  rationale: string;
  author: { id: string; name: string | null };
  approvedBy: { id: string; name: string | null }[];
  createdAt: string;
}

const SYSTEM_AUTHOR = "00000000-0000-0000-0000-000000000000";

/** Versões do prompt de um agente, da mais recente para a mais antiga. */
export async function promptVersions(agentId: string, db?: DbClient): Promise<PromptVersionRow[]> {
  const client = db ?? (await studioContext()).db;
  const { data, error } = await client
    .from("ai_prompts")
    .select("id, agent_id, version, status, body, rationale, author_id, approved_by, created_at")
    .eq("agent_id", agentId)
    .order("version", { ascending: false });
  check("prompts", error);
  const rows = data ?? [];
  const ids = [...new Set(rows.flatMap((r) => [r.author_id, ...r.approved_by]))].filter(
    (i) => i !== SYSTEM_AUTHOR,
  );
  const people = new Map<string, string>();
  if (ids.length > 0) {
    const p = await client.from("profiles").select("id, display_name").in("id", ids);
    check("profiles", p.error);
    for (const r of p.data ?? []) people.set(r.id, r.display_name);
  }
  const person = (id: string) => ({ id, name: people.get(id) ?? null });
  return rows.map((r) => ({
    id: r.id,
    agentId: r.agent_id,
    version: r.version,
    status: isPromptStatus(r.status) ? r.status : "archived",
    body: r.body,
    rationale: r.rationale,
    author: person(r.author_id),
    approvedBy: r.approved_by.map(person),
    createdAt: r.created_at,
  }));
}

export interface EvalCaseOption {
  id: string;
  key: string;
  question: string;
  sources: { id: string; text: string }[];
}

/** Casos de regressão ativos do agente, como entrada pronta do playground. */
export async function evalCaseOptions(agentId: string, db?: DbClient): Promise<EvalCaseOption[]> {
  const client = db ?? (await studioContext()).db;
  const { data, error } = await client
    .from("eval_cases")
    .select("id, case_key, body")
    .eq("agent_id", agentId)
    .eq("active", true)
    .order("case_key");
  check("eval_cases", error);
  return (data ?? []).flatMap((c) => {
    const b = c.body;
    if (typeof b !== "object" || b === null || Array.isArray(b)) return [];
    const question = typeof b.question === "string" ? b.question : "";
    const sources = Array.isArray(b.sources)
      ? b.sources.flatMap((s) =>
          typeof s === "object" && s !== null && !Array.isArray(s)
            ? [
                {
                  id: String(s.id ?? ""),
                  text: [s.title, s.text].filter((x) => typeof x === "string").join("\n"),
                },
              ]
            : [],
        )
      : [];
    return [{ id: c.id, key: c.case_key, question, sources }];
  });
}
