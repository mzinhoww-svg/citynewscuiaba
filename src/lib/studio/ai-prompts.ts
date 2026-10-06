import "server-only";
import { z } from "zod";
import {
  AGENTS_TEXT,
  MODELS_TEXT,
  PLAYGROUND_TEXT,
  PROMPTS_TEXT,
} from "@/content/pt-BR/ai-prompts";
import { APPROVAL_ERROR_TEXT } from "@/content/pt-BR/approvals";
import { createCallAgent, type CallAgent } from "@/lib/ai/call-agent";
import {
  budgetsValid,
  nextPromptVersion,
  playgroundRun,
  promptTarget,
  type PlaygroundResult,
} from "@/lib/ai/prompts";
import { GLOBAL_DAILY_BUDGET_BRL, type ProviderKind } from "@/lib/ai/registry";
import {
  AGENT_IDS,
  type AgentConfig,
  type AiCallRow,
  type AiModel,
  type AiStore,
} from "@/lib/ai/types";
import { createApprovals, supabaseApprovalsPort, type CriticalKind } from "@/lib/approvals";
import { APPROVER_ACTION } from "@/lib/approvals/targets";
import { audit } from "@/lib/audit";
import { canAccess } from "@/lib/auth/permissions";
import { agentsOverview, promptVersions } from "@/lib/db/queries/ai-prompts";
import { StudioFailure, studioAction, type ActionContext } from "./action";
import { evaluateGovernance } from "@/lib/governance";
import { requestAndApproveCommand } from "./approvals";

/*
 * Agentes, modelos, prompts versionados e playground (P5-T5). Toda mutação passa por
 * `studioAction` (papel, modo leitura, auditoria). Publicar em produção é mudança crítica:
 * o pedido (`prompt.request`) fica registrado e `prompt_publish` (0036) consome a aprovação. A-128:
 * quem pede e tem o papel de aprovar (admin ou editor-chefe) aprova e publica na mesma ação; o
 * histórico guarda quem pediu e quem aprovou. Rollback (`prompt_rollback`) não pede aprovação nova.
 */

const noScope = () => ({});
const agentId = z.enum(AGENT_IDS);

// ---------------------------------------------------------------------------
// Prompts (O12)
// ---------------------------------------------------------------------------
const CreateInput = z.object({
  agentId,
  body: z.string().trim().min(1, PROMPTS_TEXT.bodyRequired).max(8000),
  rationale: z.string().trim().min(1, PROMPTS_TEXT.rationaleRequired).max(2000),
});
export type CreatePromptInput = z.infer<typeof CreateInput>;

/** Nova versão em rascunho, em nome de quem escreve (RLS `ai_prompts_propose`: operador_ia). */
export const createPromptVersionCommand = studioAction(
  "prompt.publish",
  noScope,
  async (i: CreatePromptInput, ctx): Promise<{ id: string; version: number }> => {
    const versions = await promptVersions(i.agentId, ctx.db);
    const production = versions.find((v) => v.status === "production");
    if (production && production.body.trim() === i.body)
      throw new StudioFailure("invalid", PROMPTS_TEXT.bodyUnchanged);
    let version = nextPromptVersion(versions);
    for (let attempt = 0; attempt < 3; attempt++) {
      const { data, error } = await ctx.db
        .from("ai_prompts")
        .insert({
          agent_id: i.agentId,
          version,
          body: i.body,
          rationale: i.rationale,
          author_id: ctx.userId,
          status: "draft",
        })
        .select("id")
        .single();
      if (!error && data) {
        ctx.setObjectRef(promptTarget(i.agentId, version));
        ctx.detail({ version, rationale: i.rationale });
        return { id: data.id, version };
      }
      if (error?.code === "23505") version++;
      else if (error?.code === "42501")
        throw new StudioFailure("forbidden", PROMPTS_TEXT.onlyOperator);
      else throw new Error(`ai_prompts insert: ${error?.message ?? "sem retorno"}`);
    }
    throw new StudioFailure("conflict", PROMPTS_TEXT.conflict);
  },
  { schema: CreateInput, auditAs: "prompt.create", objectRef: (i) => `prompt:${i.agentId}:` },
);

const RequestInput = z.object({
  agentId,
  version: z.number().int().positive(),
  justification: z.string().trim().min(1, PROMPTS_TEXT.justificationRequired).max(2000),
});
export type RequestPublishInput = z.infer<typeof RequestInput>;

export interface RequestPublishOutcome {
  approvalId: string;
  /** `published`: a versão já está em produção; `pending`: aguarda quem tem o papel de aprovar. */
  status: "published" | "pending";
}

/**
 * Marca a versão `pending` e registra o pedido `prompt.publish`; quem pode aprovar publica na
 * mesma ação (A-128).
 */
export const requestPromptPublishCommand = studioAction(
  "prompt.publish",
  noScope,
  async (i: RequestPublishInput, ctx): Promise<RequestPublishOutcome> => {
    const versions = await promptVersions(i.agentId, ctx.db);
    const v = versions.find((x) => x.version === i.version);
    if (!v) throw new StudioFailure("not_found");
    if (v.status !== "draft" && v.status !== "pending")
      throw new StudioFailure("conflict", PROMPTS_TEXT.conflict);
    // Checagens automáticas (A-160): prompt inseguro é recusado e continua rascunho; seguro segue.
    const policy = evaluateGovernance({
      kind: "prompt.publish",
      actorRoles: ctx.session?.roles.map((r) => r.role) ?? [],
      body: v.body,
    });
    if (v.status === "draft" && policy.outcome !== "rejected") {
      const { error } = await ctx.db
        .from("ai_prompts")
        .update({ status: "pending" })
        .eq("id", v.id)
        .eq("status", "draft");
      if (error) throw new Error(`ai_prompts update: ${error.message}`);
    }
    const r = await requestAndApproveCommand({
      kind: "prompt.publish",
      targetRef: promptTarget(i.agentId, i.version),
      justification: i.justification,
      details: { agentId: i.agentId, version: i.version },
      policy,
    });
    if (!r.ok) throw new StudioFailure(r.error, r.message ?? PROMPTS_TEXT.genericError);
    ctx.detail({ version: i.version, approvalId: r.value.id });
    if (r.value.status === "pending") return { approvalId: r.value.id, status: "pending" };
    const out = await publishApproved(ctx, r.value.id);
    ctx.detail({ published: true, previous: out.previous });
    return { approvalId: r.value.id, status: "published" };
  },
  {
    schema: RequestInput,
    auditAs: "prompt.request",
    objectRef: (i) => promptTarget(i.agentId, i.version),
  },
);

const PublishInput = z.object({ approvalId: z.uuid() });
export type PublishPromptInput = z.infer<typeof PublishInput>;

export interface PublishOutcome {
  agentId: string;
  version: number;
  previous: number | null;
}

/**
 * Publica a versão aprovada: só quem aprovou aplica, dentro de 24 h (quem pediu pode ser quem
 * aprova, A-128). Se o pedido ainda está pendente e a pessoa pode decidir, aprova e publica de
 * uma vez.
 */
async function publishApproved(
  ctx: ActionContext,
  approvalId: string,
): Promise<PublishOutcome & { targetRef: string }> {
  const port = supabaseApprovalsPort(ctx.db);
  const row = await port.get(approvalId);
  if (!row || row.kind !== "prompt.publish") throw new StudioFailure("not_found");
  if (row.status === "pending") {
    const action = APPROVER_ACTION[row.kind as CriticalKind];
    if (!ctx.session || !canAccess(ctx.session.roles, action))
      throw new StudioFailure("forbidden", APPROVAL_ERROR_TEXT.forbidden);
    const r = await createApprovals(ctx.db).approve({ id: approvalId });
    if (!r.ok)
      throw new StudioFailure(
        r.error === "forbidden" ? "forbidden" : "conflict",
        APPROVAL_ERROR_TEXT[r.error],
      );
    await audit(
      ctx.userId,
      "approval.approved",
      row.targetRef,
      { approvalId, kind: row.kind, requestedBy: row.requestedBy },
      ctx.db,
    );
  } else if (row.status !== "approved") {
    throw new StudioFailure("conflict", APPROVAL_ERROR_TEXT.not_pending);
  }
  const { data, error } = await ctx.db.rpc("prompt_publish", { p_approval: approvalId });
  if (error) {
    if (error.code === "42501" || /quem aprovou/.test(error.message))
      throw new StudioFailure("forbidden", PROMPTS_TEXT.publishForbidden);
    if (error.code === "P0002") throw new StudioFailure("not_found");
    throw new Error(`prompt_publish: ${error.message}`);
  }
  const out = data as {
    applied?: boolean;
    agent?: string;
    version?: number;
    previous?: number | null;
  } | null;
  if (!out?.applied) throw new StudioFailure("conflict", APPROVAL_ERROR_TEXT.not_pending);
  await audit(
    ctx.userId,
    "approval.applied",
    row.targetRef,
    { approvalId, kind: row.kind, requestedBy: row.requestedBy },
    ctx.db,
  );
  return {
    agentId: String(out.agent),
    version: Number(out.version),
    previous: out.previous ?? null,
    targetRef: row.targetRef,
  };
}

export const publishPromptCommand = studioAction(
  "prompt.publish",
  noScope,
  async (i: PublishPromptInput, ctx): Promise<PublishOutcome> => {
    const { targetRef, ...out } = await publishApproved(ctx, i.approvalId);
    ctx.setObjectRef(targetRef);
    ctx.detail({ approvalId: i.approvalId, version: out.version, previous: out.previous });
    return out;
  },
  { schema: PublishInput, auditAs: "prompt.publish", objectRef: () => "prompt:" },
);

const RollbackInput = z.object({ agentId, toVersion: z.number().int().positive() });
export type RollbackPromptInput = z.infer<typeof RollbackInput>;

/** Rollback: nova versão com o texto de uma versão que já esteve em produção (admin/editor-chefe). */
export const rollbackPromptCommand = studioAction(
  "prompt.publish",
  noScope,
  async (
    i: RollbackPromptInput,
    ctx,
  ): Promise<{ from: number | null; to: number; version: number }> => {
    if (
      !ctx.session ||
      !ctx.session.roles.some((r) => r.role === "admin" || r.role === "editor_chefe")
    )
      throw new StudioFailure("forbidden", PROMPTS_TEXT.forbidden);
    const { data, error } = await ctx.db.rpc("prompt_rollback", {
      p_agent: i.agentId,
      p_to: i.toVersion,
    });
    if (error) {
      if (error.code === "42501") throw new StudioFailure("forbidden", PROMPTS_TEXT.forbidden);
      if (error.code === "P0002") throw new StudioFailure("not_found");
      throw new Error(`prompt_rollback: ${error.message}`);
    }
    const out = data as { from?: number | null; to?: number; version?: number } | null;
    const version = Number(out?.version ?? 0);
    ctx.setObjectRef(promptTarget(i.agentId, version));
    ctx.detail({ from: out?.from ?? null, to: i.toVersion, version });
    return { from: out?.from ?? null, to: i.toVersion, version };
  },
  { schema: RollbackInput, auditAs: "prompt.rollback", objectRef: (i) => `prompt:${i.agentId}:` },
);

// ---------------------------------------------------------------------------
// Agentes (O10) e modelos (O11)
// ---------------------------------------------------------------------------
const AgentUpdateInput = z.object({
  id: agentId.or(z.literal("embed")),
  enabled: z.boolean(),
  dailyBudgetBrl: z.number().min(0).max(GLOBAL_DAILY_BUDGET_BRL),
  modelId: z.string().min(1).max(120),
  fallbackModelId: z.string().min(1).max(120).nullable(),
});
export type AgentUpdateInput = z.infer<typeof AgentUpdateInput>;

/** Liga/desliga, orçamento e modelos de um agente (RLS `ai_agents_manage`: admin, operador_ia). */
export const updateAgentCommand = studioAction(
  "rec.weights",
  noScope,
  async (i: AgentUpdateInput, ctx): Promise<void> => {
    const { agents, models } = await agentsOverview(ctx.db);
    const me = agents.find((a) => a.id === i.id);
    if (!me) throw new StudioFailure("not_found");
    if (i.fallbackModelId !== null && i.fallbackModelId === i.modelId)
      throw new StudioFailure("invalid", AGENTS_TEXT.sameModel);
    const primary = models.find((m) => m.id === i.modelId);
    if (!primary || (!primary.active && i.enabled))
      throw new StudioFailure("invalid", AGENTS_TEXT.inactiveModel);
    if (i.fallbackModelId !== null && !models.some((m) => m.id === i.fallbackModelId))
      throw new StudioFailure("invalid", AGENTS_TEXT.sameModel);
    const next = agents.map((a) =>
      a.id === i.id ? { id: a.id, dailyBudgetBrl: i.dailyBudgetBrl } : a,
    );
    const budgets = budgetsValid(next, GLOBAL_DAILY_BUDGET_BRL);
    if (!budgets.ok) throw new StudioFailure("invalid", AGENTS_TEXT.budgetOver);
    const { data, error } = await ctx.db
      .from("ai_agents")
      .update({
        enabled: i.enabled,
        daily_budget_brl: i.dailyBudgetBrl,
        model_id: i.modelId,
        fallback_model_id: i.fallbackModelId,
      })
      .eq("id", i.id)
      .select("id");
    if (error) {
      if (error.code === "23514") throw new StudioFailure("invalid", AGENTS_TEXT.budgetOver);
      throw new Error(`ai_agents update: ${error.message}`);
    }
    if (!data?.length) throw new StudioFailure("forbidden", AGENTS_TEXT.readOnly);
    ctx.detail({
      before: {
        enabled: me.enabled,
        dailyBudgetBrl: me.dailyBudgetBrl,
        modelId: me.modelId,
        fallbackModelId: me.fallbackModelId,
      },
      after: {
        enabled: i.enabled,
        dailyBudgetBrl: i.dailyBudgetBrl,
        modelId: i.modelId,
        fallbackModelId: i.fallbackModelId,
      },
    });
  },
  { schema: AgentUpdateInput, auditAs: "ai.agent.update", objectRef: (i) => `agent:${i.id}` },
);

const ModelUpdateInput = z.object({ id: z.string().min(1).max(120), active: z.boolean() });
export type ModelUpdateInput = z.infer<typeof ModelUpdateInput>;

/** Ativa ou desativa um modelo; principal de agente ligado não desativa. */
export const updateModelCommand = studioAction(
  "rec.weights",
  noScope,
  async (i: ModelUpdateInput, ctx): Promise<void> => {
    const { agents } = await agentsOverview(ctx.db);
    if (!i.active && agents.some((a) => a.enabled && a.modelId === i.id))
      throw new StudioFailure("conflict", MODELS_TEXT.inUse);
    const { data, error } = await ctx.db
      .from("ai_models")
      .update({ status: i.active ? "active" : "inactive", updated_by: ctx.userId })
      .eq("id", i.id)
      .select("id");
    if (error) throw new Error(`ai_models update: ${error.message}`);
    if (!data?.length) throw new StudioFailure("not_found");
    ctx.detail({ active: i.active });
  },
  { schema: ModelUpdateInput, auditAs: "ai.model.update", objectRef: (i) => `model:${i.id}` },
);

// ---------------------------------------------------------------------------
// Playground (O15)
// ---------------------------------------------------------------------------
const PlaygroundInput = z.object({
  agentId,
  promptVersion: z.number().int().positive().optional(),
  modelId: z.string().min(1).max(120).optional(),
  task: z.string().trim().min(1, PLAYGROUND_TEXT.taskRequired).max(2000),
  data: z
    .array(z.object({ id: z.string().trim().min(1).max(80), text: z.string().max(20_000) }))
    .min(1, PLAYGROUND_TEXT.dataRequired)
    .max(12),
});
export type PlaygroundCommandInput = z.infer<typeof PlaygroundInput>;

export interface PlaygroundOutcome extends PlaygroundResult {
  providerKind: ProviderKind;
  promptVersion: number | null;
  modelId: string;
}

type PlaygroundAi = (over: {
  prompt: { agentId: string; version: number; body: string } | null;
  model: AiModel | null;
}) => { providerKind: ProviderKind; callAgent: CallAgent; calls: () => AiCallRow[] };

let testAi: PlaygroundAi | null = null;
/** Testes de integração injetam o provedor falso com registro em memória. */
export function setPlaygroundAiForTests(f: PlaygroundAi | null): void {
  testAi = f;
}

/** Registro de produção com prompt e modelo trocados e chamadas capturadas. */
export function withOverrides(
  store: AiStore,
  agent: string,
  over: { prompt: { version: number; body: string } | null; model: AiModel | null },
  calls: AiCallRow[],
): AiStore {
  return {
    ...store,
    async agent(id) {
      const a = await store.agent(id);
      if (!a || id !== agent) return a;
      const out: AgentConfig = {
        ...a,
        prompt: over.prompt ?? a.prompt,
        model: over.model ?? a.model,
        fallback: over.model ? null : a.fallback,
      };
      return out;
    },
    async recordCall(row) {
      calls.push(row);
      await store.recordCall(row);
    },
  };
}

async function playgroundAi(over: Parameters<PlaygroundAi>[0]): Promise<ReturnType<PlaygroundAi>> {
  if (testAi) return testAi(over);
  const [
    { createServiceClient },
    { createAiStore },
    { createFakeProvider },
    { createOpenRouterProvider, openRouterConfigFromEnv },
    { resolveProviderKind },
  ] = await Promise.all([
    import("@/lib/db/client"),
    import("@/lib/db/ai-store"),
    import("@/lib/ai/fake"),
    import("@/lib/ai/openrouter"),
    import("@/lib/ai/registry"),
  ]);
  const providerKind = resolveProviderKind(process.env);
  const config = openRouterConfigFromEnv();
  const provider =
    providerKind === "openrouter" && config
      ? createOpenRouterProvider(config)
      : createFakeProvider();
  const calls: AiCallRow[] = [];
  const agent = over.prompt?.agentId ?? "";
  const store = withOverrides(createAiStore(createServiceClient()), agent, over, calls);
  return {
    providerKind: provider.kind,
    callAgent: createCallAgent({ store, provider, now: () => new Date() }),
    calls: () => calls,
  };
}

/** Roda o agente com a entrada colada; grava só `ai_calls` (nunca `articles`). */
export const playgroundCommand = studioAction(
  "prompt.publish",
  noScope,
  async (i: PlaygroundCommandInput, ctx): Promise<PlaygroundOutcome> => {
    const [versions, { models, agents }] = await Promise.all([
      promptVersions(i.agentId, ctx.db),
      agentsOverview(ctx.db),
    ]);
    const me = agents.find((a) => a.id === i.agentId);
    const production = versions.find((v) => v.status === "production");
    const chosen =
      i.promptVersion === undefined
        ? production
        : versions.find((v) => v.version === i.promptVersion);
    if (i.promptVersion !== undefined && !chosen) throw new StudioFailure("not_found");
    const modelRow = i.modelId ? models.find((m) => m.id === i.modelId) : undefined;
    if (i.modelId && !modelRow) throw new StudioFailure("not_found");
    const model: AiModel | null = modelRow
      ? {
          id: modelRow.id,
          maxTokens: modelRow.maxTokens,
          temperature: modelRow.temperature,
          costPer1kIn: modelRow.costPer1kIn,
          costPer1kOut: modelRow.costPer1kOut,
          active: modelRow.active,
        }
      : null;
    const ai = await playgroundAi({
      prompt: chosen ? { agentId: i.agentId, version: chosen.version, body: chosen.body } : null,
      model,
    });
    const result = await playgroundRun(
      { agentId: i.agentId, task: i.task, data: i.data },
      {
        callAgent: ai.callAgent,
        calls: () => ai.calls().map((c) => ({ costBrl: c.cost_brl, latencyMs: c.latency_ms })),
      },
    );
    const promptVersion = chosen?.version ?? null;
    const modelId = model?.id ?? me?.modelId ?? "";
    ctx.detail({
      promptVersion,
      modelId,
      provider: ai.providerKind,
      valid: result.valid,
      error: result.error,
      costBrl: result.costBrl,
      latencyMs: result.latencyMs,
      dataBlocks: i.data.length,
    });
    return { ...result, providerKind: ai.providerKind, promptVersion, modelId };
  },
  { schema: PlaygroundInput, auditAs: "ai.playground.run", objectRef: (i) => `agent:${i.agentId}` },
);
