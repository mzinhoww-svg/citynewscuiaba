import "server-only";
import { GLOBAL_DAILY_BUDGET_BRL } from "@/lib/ai/registry";
import type { EvalCase, RegressionMetrics } from "@/lib/ai/eval";
import { EvalCaseSchema } from "@/lib/ai/eval";
import { costSummary, type CostSummary } from "@/lib/control";
import type { Json } from "@/lib/db/types";
import { localDateKey, startOfDay } from "@/lib/format/date";
import { studioContext } from "@/lib/studio/context";

/*
 * Leituras da IA no Control Center (O09 custos, O13 bases, O14 avaliações, O16 governança) com
 * a sessão da pessoa (RLS e funções da migration 0028).
 */

function check(what: string, error: { message: string } | null): void {
  if (error) throw new Error(`ia ${what}: ${error.message}`);
}
const num = (v: unknown): number => (typeof v === "number" ? v : Number(v ?? 0) || 0);
const obj = (v: Json): Record<string, Json | undefined> =>
  typeof v === "object" && v !== null && !Array.isArray(v) ? v : {};

// ---------------------------------------------------------------------------
// Custos (O09)
// ---------------------------------------------------------------------------
export async function costOverview(now: Date = new Date()): Promise<CostSummary> {
  const { db } = await studioContext();
  const today = localDateKey(now);
  const since = startOfDay(new Date(now.getTime() - 29 * 86_400_000));
  const [rows, agents, published] = await Promise.all([
    db.rpc("ai_cost_daily", { p_since: since.toISOString() }),
    db.from("ai_agents").select("id, daily_budget_brl"),
    db
      .from("articles")
      .select("id", { count: "exact", head: true })
      .gte("published_at", since.toISOString())
      .in("status", ["published", "updated"]),
  ]);
  check("cost_daily", rows.error);
  check("agents", agents.error);
  check("published", published.error);
  return costSummary({
    today,
    globalBudgetBrl: GLOBAL_DAILY_BUDGET_BRL,
    published30d: published.count ?? 0,
    budgets: (agents.data ?? []).map((a) => ({
      agentId: a.id,
      dailyBudgetBrl: num(a.daily_budget_brl),
    })),
    rows: (rows.data ?? []).map((r) => ({
      day: r.day,
      agentId: r.agent_id,
      modelId: r.model_id,
      costBrl: num(r.cost_brl),
      calls: r.calls,
      errors: r.errors,
      fallbacks: r.fallbacks,
      tokensIn: num(r.tokens_in),
      tokensOut: num(r.tokens_out),
      avgLatencyMs: r.avg_latency_ms,
    })),
  });
}

// ---------------------------------------------------------------------------
// Bases de conhecimento (O13)
// ---------------------------------------------------------------------------
export interface KnowledgeBase {
  base: string;
  total: number;
  indexed: number;
  embedded: number;
  updatedAt: string | null;
}

export async function knowledgeBases(): Promise<KnowledgeBase[]> {
  const { db } = await studioContext();
  const { data, error } = await db.rpc("ai_knowledge_bases");
  check("knowledge", error);
  return (data ?? []).map((r) => ({
    base: r.base,
    total: r.total,
    indexed: r.indexed,
    embedded: r.embedded,
    updatedAt: r.updated_at,
  }));
}

// ---------------------------------------------------------------------------
// Avaliações (O14)
// ---------------------------------------------------------------------------
export interface EvalRunRow {
  id: string;
  agentId: string;
  promptVersion: number | null;
  modelId: string | null;
  provider: string;
  trigger: string;
  cases: number;
  metrics: RegressionMetrics;
  gateFailures: string[];
  createdAt: string;
}

export interface EvalCaseRow {
  id: string;
  key: string;
  active: boolean;
  body: EvalCase | null;
}

const METRIC_KEYS = [
  "precision",
  "coverage",
  "unsourced",
  "hallucinationsPer100",
  "refusalsCorrect",
  "refusalsWrong",
  "p95",
] as const;

function toMetrics(v: Json): RegressionMetrics {
  const o = obj(v);
  const m = {} as Record<(typeof METRIC_KEYS)[number], number>;
  for (const k of METRIC_KEYS) m[k] = num(o[k]);
  return m;
}

export async function evalOverview(agentId: string): Promise<{
  runs: EvalRunRow[];
  cases: EvalCaseRow[];
  prompts: { version: number; status: string }[];
}> {
  const { db } = await studioContext();
  const [runs, cases, prompts] = await Promise.all([
    db
      .from("eval_runs")
      .select(
        "id, agent_id, prompt_version, model_id, provider, trigger, cases, metrics, gate_failures, created_at",
      )
      .eq("agent_id", agentId)
      .order("created_at", { ascending: false })
      .limit(20),
    db
      .from("eval_cases")
      .select("id, case_key, active, body")
      .eq("agent_id", agentId)
      .order("case_key"),
    db
      .from("ai_prompts")
      .select("version, status")
      .eq("agent_id", agentId)
      .order("version", { ascending: false }),
  ]);
  check("eval_runs", runs.error);
  check("eval_cases", cases.error);
  check("prompts", prompts.error);
  return {
    runs: (runs.data ?? []).map((r) => ({
      id: r.id,
      agentId: r.agent_id,
      promptVersion: r.prompt_version,
      modelId: r.model_id,
      provider: r.provider,
      trigger: r.trigger,
      cases: r.cases,
      metrics: toMetrics(r.metrics),
      gateFailures: r.gate_failures,
      createdAt: r.created_at,
    })),
    cases: (cases.data ?? []).map((c) => {
      const parsed = EvalCaseSchema.safeParse(c.body);
      return {
        id: c.id,
        key: c.case_key,
        active: c.active,
        body: parsed.success ? parsed.data : null,
      };
    }),
    prompts: prompts.data ?? [],
  };
}

// ---------------------------------------------------------------------------
// Governança (O16)
// ---------------------------------------------------------------------------
export interface GovernanceAgent {
  id: string;
  fn: string;
  enabled: boolean;
  modelId: string;
  fallbackModelId: string | null;
  promptVersion: number | null;
  dailyBudgetBrl: number;
  pendingPrompts: number;
  lastEval: { at: string; passed: boolean } | null;
}

export interface GovernanceData {
  aiEnabled: boolean;
  imageReproduction: boolean;
  agents: GovernanceAgent[];
  securityEvents30d: number;
  pendingApprovals: number;
  prompts: {
    agentId: string;
    version: number;
    status: string;
    createdAt: string;
    approvals: number;
  }[];
}

export async function governanceOverview(now: Date = new Date()): Promise<GovernanceData> {
  const { db } = await studioContext();
  const since30 = new Date(now.getTime() - 30 * 86_400_000).toISOString();
  const [agents, prompts, flags, security, approvals, evals] = await Promise.all([
    db
      .from("ai_agents")
      .select(
        "id, function, enabled, model_id, fallback_model_id, prompt_version, daily_budget_brl",
      )
      .order("id"),
    db
      .from("ai_prompts")
      .select("agent_id, version, status, created_at, approved_by")
      .order("created_at", { ascending: false })
      .limit(30),
    db.from("feature_flags").select("key, enabled"),
    db
      .from("pipeline_events_view")
      .select("id", { count: "exact", head: true })
      .eq("level", "security")
      .gte("at", since30),
    db
      .from("approvals")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending")
      .like("kind", "prompt.%"),
    db
      .from("eval_runs")
      .select("agent_id, created_at, gate_failures")
      .order("created_at", { ascending: false })
      .limit(50),
  ]);
  check("agents", agents.error);
  check("prompts", prompts.error);
  check("flags", flags.error);
  check("security", security.error);
  check("approvals", approvals.error);
  check("evals", evals.error);
  const flag = (k: string) => (flags.data ?? []).some((f) => f.key === k && f.enabled);
  const lastEval = (agentId: string) => {
    const r = (evals.data ?? []).find((e) => e.agent_id === agentId);
    return r ? { at: r.created_at, passed: r.gate_failures.length === 0 } : null;
  };
  const allPrompts = prompts.data ?? [];
  return {
    aiEnabled: flag("ai_enabled"),
    imageReproduction: flag("image_reproduction_enabled"),
    securityEvents30d: security.count ?? 0,
    pendingApprovals: approvals.count ?? 0,
    agents: (agents.data ?? []).map((a) => ({
      id: a.id,
      fn: a.function,
      enabled: a.enabled,
      modelId: a.model_id,
      fallbackModelId: a.fallback_model_id,
      promptVersion: a.prompt_version,
      dailyBudgetBrl: num(a.daily_budget_brl),
      pendingPrompts: allPrompts.filter(
        (p) => p.agent_id === a.id && (p.status === "pending" || p.status === "draft"),
      ).length,
      lastEval: lastEval(a.id),
    })),
    prompts: allPrompts.slice(0, 10).map((p) => ({
      agentId: p.agent_id,
      version: p.version,
      status: p.status,
      createdAt: p.created_at,
      approvals: p.approved_by.length,
    })),
  };
}
