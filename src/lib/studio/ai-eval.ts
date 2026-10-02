import "server-only";
import { z } from "zod";
import { AI_TEXT } from "@/content/pt-BR/ai-control";
import type { CallAgent } from "@/lib/ai/call-agent";
import {
  EVAL_AGENTS,
  EvalCaseSchema,
  regressionGate,
  runRegression,
  type EvalCase,
  type GateFailure,
  type RegressionMetrics,
} from "@/lib/ai/eval";
import type { ProviderKind } from "@/lib/ai/registry";
import type { Json } from "@/lib/db/types";
import { StudioFailure, studioAction } from "./action";

/*
 * Avaliação sob demanda (O14): roda os casos ativos de `eval_cases` com a versão de prompt
 * escolhida (padrão: a de produção) pelo provedor configurado e grava a rodada em `eval_runs`.
 * Exige `prompt.publish` (quem assina prompt). Com `AI_PROVIDER=fake`, nada sai para a rede.
 */

type EvalAi = (prompt: { agentId: string; version: number; body: string } | null) => {
  providerKind: ProviderKind;
  callAgent: CallAgent;
};

let testAi: EvalAi | null = null;
/** Testes de integração usam o provedor falso com registro em memória. */
export function setEvalAiForTests(f: EvalAi | null): void {
  testAi = f;
}

async function evalAi(prompt: { agentId: string; version: number; body: string } | null) {
  if (testAi) return testAi(prompt);
  const { createProductionAi } = await import("@/lib/ai/server");
  return createProductionAi(prompt ? { prompt } : {});
}

const RunInput = z.object({
  agentId: z.enum(EVAL_AGENTS),
  promptVersion: z.number().int().positive().optional(),
});

export interface EvalOutcome extends RegressionMetrics {
  runId: string;
  cases: number;
  promptVersion: number | null;
  gateFailures: GateFailure[];
}

export const runEvaluationCommand = studioAction(
  "prompt.publish",
  () => ({}),
  async (i: z.infer<typeof RunInput>, ctx): Promise<EvalOutcome> => {
    const [casesRes, agentRes] = await Promise.all([
      ctx.db.from("eval_cases").select("body").eq("agent_id", i.agentId).eq("active", true),
      ctx.db.from("ai_agents").select("model_id, prompt_version").eq("id", i.agentId).maybeSingle(),
    ]);
    if (casesRes.error) throw new Error(`eval_cases: ${casesRes.error.message}`);
    if (agentRes.error) throw new Error(`ai_agents: ${agentRes.error.message}`);
    const cases: EvalCase[] = (casesRes.data ?? []).flatMap((c) => {
      const p = EvalCaseSchema.safeParse(c.body);
      return p.success ? [p.data] : [];
    });
    if (cases.length === 0) throw new StudioFailure("invalid", AI_TEXT.evals.noCases);

    let prompt: { agentId: string; version: number; body: string } | null = null;
    const version = i.promptVersion ?? agentRes.data?.prompt_version ?? null;
    if (i.promptVersion !== undefined && i.promptVersion !== agentRes.data?.prompt_version) {
      const { data, error } = await ctx.db
        .from("ai_prompts")
        .select("body")
        .eq("agent_id", i.agentId)
        .eq("version", i.promptVersion)
        .maybeSingle();
      if (error) throw new Error(`ai_prompts: ${error.message}`);
      if (!data) throw new StudioFailure("not_found", AI_TEXT.evals.noPrompt);
      prompt = { agentId: i.agentId, version: i.promptVersion, body: data.body };
    }

    const ai = await evalAi(prompt);
    const report = await runRegression(
      { agentId: i.agentId, promptVersion: version ?? 0, cases },
      { callAgent: ai.callAgent, now: ctx.now },
    );
    const gateFailures = regressionGate(report);
    const metrics: RegressionMetrics = {
      precision: report.precision,
      coverage: report.coverage,
      unsourced: report.unsourced,
      hallucinationsPer100: report.hallucinationsPer100,
      refusalsCorrect: report.refusalsCorrect,
      refusalsWrong: report.refusalsWrong,
      p95: report.p95,
    };
    const { data: run, error } = await ctx.db
      .from("eval_runs")
      .insert({
        agent_id: i.agentId,
        prompt_version: version,
        model_id: agentRes.data?.model_id ?? null,
        provider: ai.providerKind,
        trigger: "manual",
        cases: report.cases,
        metrics: { ...metrics },
        gate_failures: gateFailures,
        results: JSON.parse(JSON.stringify(report.results)) as NonNullable<Json>,
        created_by: ctx.userId,
      })
      .select("id")
      .single();
    if (error || !run) throw new Error(`eval_runs: ${error?.message ?? "sem retorno"}`);
    ctx.setObjectRef(`eval_run:${run.id}`);
    ctx.detail({ agentId: i.agentId, promptVersion: version, gateFailures, cases: report.cases });
    return { ...metrics, runId: run.id, cases: report.cases, promptVersion: version, gateFailures };
  },
  { schema: RunInput, auditAs: "ai.eval.run", objectRef: () => "eval_run:" },
);

const ToggleInput = z.object({ id: z.uuid(), active: z.boolean() });

/** Liga ou desliga um caso de regressão (fica no histórico; nada é apagado). */
export const toggleEvalCaseCommand = studioAction(
  "prompt.publish",
  () => ({}),
  async (i: z.infer<typeof ToggleInput>, ctx): Promise<void> => {
    const { data, error } = await ctx.db
      .from("eval_cases")
      .update({ active: i.active })
      .eq("id", i.id)
      .select("id");
    if (error) throw new Error(`eval_cases: ${error.message}`);
    if (!data?.length) throw new StudioFailure("not_found");
    ctx.detail({ active: i.active });
  },
  { schema: ToggleInput, auditAs: "ai.eval.case", objectRef: (i) => `eval_case:${i.id}` },
);
