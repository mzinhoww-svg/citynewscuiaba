import "server-only";
import { EVAL_CASES } from "@/lib/ai/eval-cases";
import type { EvalMetrics } from "@/lib/ai/eval";
import { GLOBAL_DAILY_BUDGET_BRL } from "@/lib/ai/registry";
import { summarizeCosts, type CostSummary } from "@/lib/ai/costs";
import { studioContext } from "@/lib/studio/context";

/*
 * Leituras das telas de conhecimento, avaliações, custos e governança da IA (Control Center O09,
 * O13, O14 e O16; P5-T6), com a sessão da pessoa (RLS). `ai_calls` e `ai_eval_runs` só para
 * admin, editor-chefe, operação de IA e análise.
 */

export interface KnowledgeCorpus {
  articles: { total: number; indexed: number };
  items: { total: number; indexed: number };
}

export interface KnowledgeSource {
  id: string;
  name: string;
  kind: string;
  status: string;
  reliability: string;
  republishPolicy: string;
  imagePolicy: string;
}

export async function getKnowledge(): Promise<{
  corpus: KnowledgeCorpus;
  sources: KnowledgeSource[];
}> {
  const { db } = await studioContext();
  const [art, artIdx, items, itemsIdx, sources] = await Promise.all([
    db.from("articles").select("id", { count: "exact", head: true }).eq("status", "published"),
    db
      .from("articles")
      .select("id", { count: "exact", head: true })
      .eq("status", "published")
      .not("embedding", "is", null),
    db.from("collected_items").select("id", { count: "exact", head: true }),
    db
      .from("collected_items")
      .select("id", { count: "exact", head: true })
      .not("embedding", "is", null),
    db
      .from("sources")
      .select("id, name, kind, status, reliability, republish_policy, image_policy")
      .in("status", ["active", "degraded"])
      .order("name", { ascending: true })
      .limit(200),
  ]);
  for (const r of [art, artIdx, items, itemsIdx, sources])
    if (r.error) throw new Error(`conhecimento: ${r.error.message}`);
  return {
    corpus: {
      articles: { total: art.count ?? 0, indexed: artIdx.count ?? 0 },
      items: { total: items.count ?? 0, indexed: itemsIdx.count ?? 0 },
    },
    sources: (sources.data ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      kind: s.kind,
      status: s.status,
      reliability: s.reliability,
      republishPolicy: s.republish_policy,
      imagePolicy: s.image_policy,
    })),
  };
}

export interface EvalRunRow {
  id: string;
  agentId: string;
  promptVersion: number;
  provider: string;
  cases: number;
  metrics: EvalMetrics;
  createdAt: string;
}

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/** Lê as métricas guardadas em `jsonb`, sem confiar no formato. */
export function parseMetrics(raw: unknown, cases: number): EvalMetrics {
  const m = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  return {
    precision: num(m.precision),
    coverage: num(m.coverage),
    unsourced: num(m.unsourced),
    hallucinationsPer100: num(m.hallucinationsPer100),
    refusalsCorrect: num(m.refusalsCorrect),
    refusalsWrong: num(m.refusalsWrong),
    p95: num(m.p95),
    errors: num(m.errors),
    cases,
  };
}

export async function listEvalRuns(limit = 20): Promise<EvalRunRow[]> {
  const { db } = await studioContext();
  const { data, error } = await db
    .from("ai_eval_runs")
    .select("id, agent_id, prompt_version, provider, case_count, metrics, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`avaliações: ${error.message}`);
  return (data ?? []).map((r) => ({
    id: r.id,
    agentId: r.agent_id,
    promptVersion: r.prompt_version,
    provider: r.provider,
    cases: r.case_count,
    metrics: parseMetrics(r.metrics, r.case_count),
    createdAt: r.created_at,
  }));
}

export const evalCaseCount = () => EVAL_CASES.length;

const COST_DAYS = 14;

export async function getCosts(now: Date = new Date()): Promise<{
  summary: CostSummary;
  days: number;
}> {
  const { db } = await studioContext();
  const since = new Date(now.getTime() - (COST_DAYS + 1) * 86_400_000);
  const [agents, calls] = await Promise.all([
    db.from("ai_agents").select("id, daily_budget_brl").order("id", { ascending: true }),
    db
      .from("ai_calls")
      .select("agent_id, model_id, cost_brl, created_at")
      .gte("created_at", since.toISOString())
      .order("created_at", { ascending: false })
      .limit(50_000),
  ]);
  if (agents.error) throw new Error(`custos (agentes): ${agents.error.message}`);
  if (calls.error) throw new Error(`custos: ${calls.error.message}`);
  const summary = summarizeCosts(
    (calls.data ?? []).map((c) => ({
      agentId: c.agent_id,
      modelId: c.model_id,
      costBrl: Number(c.cost_brl ?? 0),
      at: c.created_at,
    })),
    (agents.data ?? []).map((a) => ({ id: a.id, dailyBudgetBrl: Number(a.daily_budget_brl) })),
    now,
    { days: COST_DAYS, globalBudgetBrl: GLOBAL_DAILY_BUDGET_BRL },
  );
  return { summary, days: COST_DAYS };
}

export const AI_FLAG_KEYS = [
  "ai_enabled",
  "personalization_enabled",
  "image_reproduction_enabled",
  "source_link_analysis",
] as const;

export async function getAiFlags(): Promise<Record<string, boolean | null>> {
  const { db } = await studioContext();
  const { data, error } = await db
    .from("feature_flags")
    .select("key, enabled")
    .in("key", [...AI_FLAG_KEYS]);
  if (error) throw new Error(`governança: ${error.message}`);
  const map = new Map((data ?? []).map((f) => [f.key, f.enabled]));
  return Object.fromEntries(AI_FLAG_KEYS.map((k) => [k, map.get(k) ?? null]));
}
