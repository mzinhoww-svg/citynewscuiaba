import "server-only";
import { dayStartCuiaba } from "@/lib/ai/registry";
import { studioContext } from "@/lib/studio/context";

/*
 * Leituras das telas de agentes, modelos, prompts e playground (Control Center O10, O11, O12 e
 * O15; P5-T5), com a sessão da pessoa (RLS: a equipe lê `ai_agents`, `ai_models`, `ai_prompts`;
 * `ai_calls` só admin, editor-chefe, operação de IA e análise).
 */

export interface ModelRow {
  id: string;
  provider: string;
  name: string;
  version: string;
  maxTokens: number | null;
  temperature: number | null;
  costPer1kIn: number | null;
  costPer1kOut: number | null;
  active: boolean;
  usedBy: string[];
}

export interface AgentRow {
  id: string;
  function: string;
  modelId: string;
  fallbackModelId: string | null;
  promptVersion: number | null;
  dailyBudgetBrl: number;
  spentTodayBrl: number;
  enabled: boolean;
}

export interface PromptRow {
  id: string;
  agentId: string;
  version: number;
  body: string;
  rationale: string;
  status: string;
  authorId: string;
  authorName: string | null;
  approvedBy: string[];
  approverName: string | null;
  createdAt: string;
  rollbackOf: number | null;
  /** Pedido de aprovação pendente desta versão (`null` sem pedido). */
  pendingApproval: { id: string; requestedBy: string } | null;
  /** Último pedido foi recusado e a versão não saiu do rascunho. */
  rejected: boolean;
}

const SYSTEM_USER = "00000000-0000-0000-0000-000000000000";

export async function listModels(): Promise<ModelRow[]> {
  const { db } = await studioContext();
  const [models, agents] = await Promise.all([
    db
      .from("ai_models")
      .select(
        "id, provider, name, version, max_tokens, temperature, cost_per_1k_in, cost_per_1k_out, status",
      )
      .order("name", { ascending: true }),
    db.from("ai_agents").select("id, model_id, fallback_model_id"),
  ]);
  if (models.error) throw new Error(`modelos: ${models.error.message}`);
  if (agents.error) throw new Error(`modelos (agentes): ${agents.error.message}`);
  return (models.data ?? []).map((m) => ({
    id: m.id,
    provider: m.provider,
    name: m.name,
    version: m.version,
    maxTokens: m.max_tokens,
    temperature: m.temperature === null ? null : Number(m.temperature),
    costPer1kIn: m.cost_per_1k_in === null ? null : Number(m.cost_per_1k_in),
    costPer1kOut: m.cost_per_1k_out === null ? null : Number(m.cost_per_1k_out),
    active: m.status === "active",
    usedBy: (agents.data ?? [])
      .filter((a) => a.model_id === m.id || a.fallback_model_id === m.id)
      .map((a) => a.id),
  }));
}

export async function listAgents(now: Date = new Date()): Promise<AgentRow[]> {
  const { db } = await studioContext();
  const [agents, calls] = await Promise.all([
    db
      .from("ai_agents")
      .select(
        "id, function, model_id, fallback_model_id, prompt_version, daily_budget_brl, enabled",
      )
      .order("id", { ascending: true }),
    db
      .from("ai_calls")
      .select("agent_id, cost_brl")
      .gte("created_at", dayStartCuiaba(now).toISOString())
      .limit(20_000),
  ]);
  if (agents.error) throw new Error(`agentes: ${agents.error.message}`);
  if (calls.error) throw new Error(`agentes (gasto): ${calls.error.message}`);
  const spent = new Map<string, number>();
  for (const c of calls.data ?? [])
    spent.set(c.agent_id, (spent.get(c.agent_id) ?? 0) + Number(c.cost_brl ?? 0));
  return (agents.data ?? []).map((a) => ({
    id: a.id,
    function: a.function,
    modelId: a.model_id,
    fallbackModelId: a.fallback_model_id,
    promptVersion: a.prompt_version,
    dailyBudgetBrl: Number(a.daily_budget_brl),
    spentTodayBrl: Math.round((spent.get(a.id) ?? 0) * 1_000_000) / 1_000_000,
    enabled: a.enabled,
  }));
}

export async function getAgent(id: string): Promise<AgentRow | null> {
  return (await listAgents()).find((a) => a.id === id) ?? null;
}

/** Versões de prompt de um agente, da mais nova para a mais antiga (até 60). */
export async function listPromptVersions(agentId: string): Promise<PromptRow[]> {
  const { db } = await studioContext();
  const { data, error } = await db
    .from("ai_prompts")
    .select(
      "id, agent_id, version, body, rationale, status, author_id, approved_by, created_at, rollback_of",
    )
    .eq("agent_id", agentId)
    .order("version", { ascending: false })
    .limit(60);
  if (error) throw new Error(`prompts: ${error.message}`);
  const rows = data ?? [];
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const people = [...new Set(rows.flatMap((r) => [r.author_id, ...r.approved_by]))].filter(
    (p) => p !== SYSTEM_USER,
  );
  const [appr, prof] = await Promise.all([
    db
      .from("approvals")
      .select("id, target_ref, status, requested_by, created_at")
      .eq("kind", "prompt.publish")
      .in("target_ref", ids)
      .order("created_at", { ascending: true }),
    people.length > 0
      ? db.from("profiles").select("id, display_name").in("id", people)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (appr.error) throw new Error(`prompts (aprovações): ${appr.error.message}`);
  if (prof.error) throw new Error(`prompts (pessoas): ${prof.error.message}`);
  const names = new Map((prof.data ?? []).map((p) => [p.id, p.display_name]));
  return rows.map((r) => {
    const mine = (appr.data ?? []).filter((a) => a.target_ref === r.id);
    const pending = mine.find((a) => a.status === "pending");
    const last = mine.at(-1);
    const approver = r.approved_by.find((a) => a !== r.author_id) ?? null;
    return {
      id: r.id,
      agentId: r.agent_id,
      version: r.version,
      body: r.body,
      rationale: r.rationale,
      status: r.status,
      authorId: r.author_id,
      authorName: r.author_id === SYSTEM_USER ? null : (names.get(r.author_id) ?? null),
      approvedBy: r.approved_by,
      approverName: approver ? (names.get(approver) ?? null) : null,
      createdAt: r.created_at,
      rollbackOf: r.rollback_of,
      pendingApproval: pending ? { id: pending.id, requestedBy: pending.requested_by } : null,
      rejected: !pending && last?.status === "rejected" && r.status !== "production",
    };
  });
}
