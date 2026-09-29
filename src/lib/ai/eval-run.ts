import "server-only";
import { AI_OPS_TEXT as T } from "@/content/pt-BR/control-ai-ops";
import { audit } from "@/lib/audit";
import { canAccess } from "@/lib/auth/permissions";
import { studioContext } from "@/lib/studio/context";
import { EVAL_CASES } from "./eval-cases";
import { EVAL_AGENT, runRegression, type EvalMetrics } from "./eval";
import { createFakeProvider } from "./fake";

/*
 * Executa a regressão pelo Estúdio (O14) e registra o resultado em `ai_eval_runs` em nome de
 * quem executou (RLS: admin, editor-chefe e operação de IA). Sempre com o provedor falso: a tela
 * nunca gasta orçamento nem chama modelo real. Audita como `prompt.playground` (com `eval`).
 */
export type EvalRunResult =
  | { ok: true; id: string; promptVersion: number; metrics: EvalMetrics }
  | { ok: false; error: "forbidden" | "unknown_agent" | "not_found"; message: string };

export async function executeRegression(input: {
  agentId: string;
  promptVersion: number;
}): Promise<EvalRunResult> {
  const ctx = await studioContext();
  const session = ctx.session;
  if (!session) return { ok: false, error: "forbidden", message: T.runDenied };
  const objectRef = `agent:${String(input?.agentId ?? "")}`;
  if (!canAccess(session.roles, "prompt.publish")) {
    await audit(session.userId, "prompt.playground.denied", objectRef, { eval: true }, ctx.db);
    return { ok: false, error: "forbidden", message: T.runDenied };
  }
  if (input.agentId !== EVAL_AGENT)
    return { ok: false, error: "unknown_agent", message: T.runUnknownAgent };

  const version = Number(input.promptVersion);
  const prompt = await ctx.db
    .from("ai_prompts")
    .select("version, body")
    .eq("agent_id", EVAL_AGENT)
    .eq("version", version)
    .maybeSingle();
  if (prompt.error) throw new Error(`avaliação: ${prompt.error.message}`);
  if (!prompt.data) return { ok: false, error: "not_found", message: T.runPromptMissing };

  const metrics = await runRegression(
    { agentId: EVAL_AGENT, promptVersion: prompt.data.version, cases: [...EVAL_CASES] },
    { provider: createFakeProvider(), promptBody: prompt.data.body },
  );
  const saved = await ctx.db
    .from("ai_eval_runs")
    .insert({
      agent_id: EVAL_AGENT,
      prompt_version: prompt.data.version,
      provider: "fake",
      case_count: metrics.cases,
      metrics: { ...metrics },
      created_by: session.userId,
    })
    .select("id")
    .single();
  if (saved.error) throw new Error(`avaliação: ${saved.error.message}`);
  await audit(
    session.userId,
    "prompt.playground",
    objectRef,
    { eval: true, promptVersion: prompt.data.version, cases: metrics.cases },
    ctx.db,
  );
  return { ok: true, id: saved.data.id, promptVersion: prompt.data.version, metrics };
}
