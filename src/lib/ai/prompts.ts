import "server-only";
import { createHash } from "node:crypto";
import { AI_ADMIN_TEXT as T } from "@/content/pt-BR/control-ai";
import { APPROVAL_ERROR_TEXT } from "@/content/pt-BR/approvals";
import { approve, normalizeJustification, requestApproval } from "@/lib/approvals";
import { audit } from "@/lib/audit";
import { canAccess } from "@/lib/auth/permissions";
import { createServiceClient } from "@/lib/db/client";
import { studioAction, StudioFailure } from "@/lib/studio/action";
import { studioContext, type StudioContext } from "@/lib/studio/context";
import type { AiDeps } from "./call-agent";
import { PROMPT_MAX_CHARS, normalizePromptBody } from "./prompt-diff";
import { isPlaygroundAgent, runPlayground, type PlaygroundOutput } from "./playground";
import { productionAiDeps } from "./server";
import type { AiError } from "./types";

export { diffPrompt, PROMPT_MAX_CHARS } from "./prompt-diff";

/*
 * Prompts versionados e playground (P5-T5; spec §6.6 e §8). Toda mudança é uma NOVA versão
 * (`ai_prompts`, imutável depois de aprovada). Publicar em produção é a mudança crítica
 * `prompt.publish`: outra pessoa (admin ou editor-chefe) aprova e o banco publica na mesma
 * transação (`approval_apply`, migration 0032). Rollback não é exceção: cria uma nova versão
 * com o texto antigo e passa pelo mesmo pedido, e a versão que sai fica `reverted`.
 */

const PROMPT_ROLES = "prompt.publish" as const;

interface PromptRow {
  id: string;
  agent_id: string;
  version: number;
  body: string;
  status: string;
  author_id: string;
  rollback_of: number | null;
}

async function loadPrompt(ctx: StudioContext, id: string): Promise<PromptRow | null> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null;
  const { data, error } = await ctx.db
    .from("ai_prompts")
    .select("id, agent_id, version, body, status, author_id, rollback_of")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`prompts: ${error.message}`);
  return data;
}

async function productionOf(ctx: StudioContext, agentId: string): Promise<PromptRow | null> {
  const { data, error } = await ctx.db
    .from("ai_prompts")
    .select("id, agent_id, version, body, status, author_id, rollback_of")
    .eq("agent_id", agentId)
    .eq("status", "production")
    .maybeSingle();
  if (error) throw new Error(`prompts: ${error.message}`);
  return data;
}

async function assertAgent(ctx: StudioContext, agentId: string): Promise<void> {
  if (!isPlaygroundAgent(agentId)) throw new StudioFailure("invalid", T.unknownAgent);
  const { data, error } = await ctx.db
    .from("ai_agents")
    .select("id")
    .eq("id", agentId)
    .maybeSingle();
  if (error) throw new Error(`prompts: ${error.message}`);
  if (!data) throw new StudioFailure("not_found", T.unknownAgent);
}

/** Insere uma versão nova (versão = maior + 1; repete se duas pessoas criam ao mesmo tempo). */
async function insertVersion(
  ctx: StudioContext,
  userId: string,
  v: { agentId: string; body: string; rationale: string; rollbackOf: number | null },
): Promise<{ id: string; version: number }> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const top = await ctx.db
      .from("ai_prompts")
      .select("version")
      .eq("agent_id", v.agentId)
      .order("version", { ascending: false })
      .limit(1);
    if (top.error) throw new Error(`prompts: ${top.error.message}`);
    const version = (top.data?.[0]?.version ?? 0) + 1 + attempt;
    const { data, error } = await ctx.db
      .from("ai_prompts")
      .insert({
        agent_id: v.agentId,
        version,
        body: v.body,
        rationale: v.rationale,
        author_id: userId,
        status: "draft",
        rollback_of: v.rollbackOf,
      })
      .select("id, version")
      .single();
    if (!error) return data;
    if (error.code === "23505") continue;
    if (error.code === "42501") throw new StudioFailure("forbidden", T.onlyOperator);
    throw new Error(`prompts: ${error.message}`);
  }
  throw new StudioFailure("conflict", "Outra versão foi criada ao mesmo tempo. Tente de novo.");
}

export interface CreatedPrompt {
  id: string;
  version: number;
}

/**
 * Cria uma versão de prompt em rascunho para o agente (só a operação de IA: RLS e trigger).
 * Texto vazio, grande demais ou igual ao da produção, e justificativa vazia → `invalid`.
 */
export const createPromptVersion = studioAction(
  PROMPT_ROLES,
  () => ({}),
  async (
    input: { agentId: string; body: string; rationale: string },
    ctx,
  ): Promise<CreatedPrompt> => {
    await assertAgent(ctx, input.agentId);
    const body = normalizePromptBody(String(input.body ?? ""));
    if (body === "") throw new StudioFailure("invalid", T.bodyRequired);
    if (body.length > PROMPT_MAX_CHARS)
      throw new StudioFailure("invalid", T.bodyTooLong(PROMPT_MAX_CHARS));
    const rationale = normalizeJustification(String(input.rationale ?? ""));
    if (rationale === null) throw new StudioFailure("invalid", T.rationaleRequired);
    const prod = await productionOf(ctx, input.agentId);
    if (prod && normalizePromptBody(prod.body) === body)
      throw new StudioFailure("invalid", T.noChange);
    const created = await insertVersion(ctx, ctx.userId, {
      agentId: input.agentId,
      body,
      rationale,
      rollbackOf: null,
    });
    ctx.setObjectRef(`prompt:${created.id}`);
    ctx.detail({ agent: input.agentId, version: created.version });
    return created;
  },
  { auditAs: "prompt.create", objectRef: (i) => `agent:${i?.agentId ?? ""}` },
);

export type PromptFailError =
  | "forbidden"
  | "read_only"
  | "invalid"
  | "not_found"
  | "approval_required"
  | "self_approval"
  | "stale";
export type PromptFail = { ok: false; error: PromptFailError; message: string };
export type PromptOk<V> = { ok: true; value: V };

const fail = (error: PromptFailError, message: string): PromptFail => ({
  ok: false,
  error,
  message,
});

/**
 * Pede a aprovação `prompt.publish` de uma versão em rascunho (a versão passa a "pendente").
 * Justificativa obrigatória. Outra pessoa (admin ou editor-chefe) decide em Aprovações.
 */
export async function requestPromptPublication(input: {
  id: string;
  justification: string;
}): Promise<PromptOk<{ approvalId: string }> | PromptFail> {
  const ctx = await studioContext();
  if (!ctx.session || !canAccess(ctx.session.roles, PROMPT_ROLES))
    return fail("forbidden", T.forbidden);
  const prompt = await loadPrompt(ctx, input.id);
  if (!prompt) return fail("not_found", T.promptNotFound);
  if (prompt.status !== "draft" && prompt.status !== "pending") return fail("invalid", T.notDraft);
  const pending = await ctx.db
    .from("approvals")
    .select("id")
    .eq("kind", "prompt.publish")
    .eq("target_ref", prompt.id)
    .eq("status", "pending")
    .limit(1);
  if (pending.error) throw new Error(`prompts: ${pending.error.message}`);
  if ((pending.data ?? []).length > 0) return fail("invalid", T.alreadyPending);
  const r = await requestApproval({
    kind: "prompt.publish",
    targetRef: prompt.id,
    justification: input.justification,
  });
  if (!r.ok) return fail(r.error === "forbidden" ? "forbidden" : "invalid", r.message);
  const up = await ctx.db.from("ai_prompts").update({ status: "pending" }).eq("id", prompt.id);
  if (up.error) throw new Error(`prompts: ${up.error.message}`);
  return { ok: true, value: { approvalId: r.value.id } };
}

/**
 * Cria a versão e já pede a aprovação (justificativa = a da versão). Se o pedido falhar, a
 * versão fica como rascunho e o erro diz o motivo.
 */
export async function proposePrompt(input: {
  agentId: string;
  body: string;
  rationale: string;
}): Promise<PromptOk<CreatedPrompt & { approvalId: string }> | PromptFail> {
  const created = await createPromptVersion(input);
  if (!created.ok)
    return fail(
      created.error === "conflict" ? "invalid" : created.error,
      created.message ?? T.forbidden,
    );
  const req = await requestPromptPublication({
    id: created.value.id,
    justification: input.rationale,
  });
  if (!req.ok) return req;
  return { ok: true, value: { ...created.value, approvalId: req.value.approvalId } };
}

/**
 * Coloca a versão em produção, e só com a aprovação de OUTRA pessoa.
 * - Já em produção: nada a fazer (`already`).
 * - Sem pedido de aprovação, ou com aprovação já usada: `approval_required`.
 * - Pedido pendente feito por quem chama: `self_approval` ("A aprovação precisa ser de outra
 *   pessoa"); feito por outra pessoa: quem chama, se decide o tipo, aprova (o banco publica na
 *   mesma transação); se não decide, `forbidden`.
 */
export async function publishPrompt(input: {
  id: string;
}): Promise<PromptOk<{ already: boolean }> | PromptFail> {
  const ctx = await studioContext();
  if (!ctx.session || !canAccess(ctx.session.roles, PROMPT_ROLES))
    return fail("forbidden", T.forbidden);
  const prompt = await loadPrompt(ctx, input.id);
  if (!prompt) return fail("not_found", T.promptNotFound);
  if (prompt.status === "production") return { ok: true, value: { already: true } };
  if (prompt.status !== "draft" && prompt.status !== "pending") return fail("invalid", T.notDraft);
  const { data, error } = await ctx.db
    .from("approvals")
    .select("id, requested_by")
    .eq("kind", "prompt.publish")
    .eq("target_ref", prompt.id)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(`prompts: ${error.message}`);
  const pending = data?.[0];
  if (!pending) return fail("approval_required", T.approvalRequired);
  if (pending.requested_by === ctx.session.userId)
    return fail("self_approval", APPROVAL_ERROR_TEXT.self_approval);
  const r = await approve({ id: pending.id });
  if (!r.ok) {
    return fail(
      r.error === "self_approval"
        ? "self_approval"
        : r.error === "stale"
          ? "stale"
          : r.error === "forbidden"
            ? "forbidden"
            : "invalid",
      r.message,
    );
  }
  return { ok: true, value: { already: false } };
}

/**
 * Rollback: cria uma NOVA versão com o texto da versão `toVersion` (que já esteve em
 * produção) e pede a aprovação `prompt.publish`. Quando a nova versão entra em produção, a que
 * saiu fica `reverted`. Rollback não pula a aprovação dupla: um prompt ruim se corrige por
 * um pedido, com a mesma trava de qualquer publicação.
 */
export const rollbackPrompt = studioAction(
  PROMPT_ROLES,
  () => ({}),
  async (
    input: { agentId: string; toVersion: number; justification?: string },
    ctx,
  ): Promise<CreatedPrompt & { approvalId: string }> => {
    await assertAgent(ctx, input.agentId);
    const target = await ctx.db
      .from("ai_prompts")
      .select("id, version, body, status")
      .eq("agent_id", input.agentId)
      .eq("version", Number(input.toVersion))
      .maybeSingle();
    if (target.error) throw new Error(`prompts: ${target.error.message}`);
    if (!target.data) throw new StudioFailure("not_found", T.promptNotFound);
    const status = target.data.status;
    if (status === "production") throw new StudioFailure("invalid", T.rollbackTargetLive);
    if (status !== "archived" && status !== "reverted")
      throw new StudioFailure("invalid", T.rollbackTargetNever);
    const why =
      normalizeJustification(input.justification ?? "") ??
      T.rollbackDefaultWhy(target.data.version);
    const created = await insertVersion(ctx, ctx.userId, {
      agentId: input.agentId,
      body: target.data.body,
      rationale: T.rollbackRationale(target.data.version, why).slice(0, 2000),
      rollbackOf: target.data.version,
    });
    ctx.setObjectRef(`prompt:${created.id}`);
    ctx.detail({ agent: input.agentId, version: created.version, restores: target.data.version });
    const req = await requestPromptPublication({ id: created.id, justification: why });
    if (!req.ok)
      throw new StudioFailure(req.error === "forbidden" ? "forbidden" : "invalid", req.message);
    return { ...created, approvalId: req.value.approvalId };
  },
  { auditAs: "prompt.rollback", objectRef: (i) => `agent:${i?.agentId ?? ""}` },
);

/** Liga ou desliga só este agente (a flag global `ai_enabled` é da Governança). */
export const setAgentEnabled = studioAction(
  PROMPT_ROLES,
  () => ({}),
  async (input: { agentId: string; enabled: boolean }, ctx): Promise<{ enabled: boolean }> => {
    await assertAgent(ctx, input.agentId);
    const { data, error } = await ctx.db
      .from("ai_agents")
      .update({ enabled: input.enabled === true })
      .eq("id", input.agentId)
      .select("id");
    if (error) throw new Error(`agentes: ${error.message}`);
    // RLS: só admin e operação de IA escrevem em ai_agents (0 linhas = sem permissão).
    if ((data ?? []).length === 0) throw new StudioFailure("forbidden", T.toggleDenied);
    ctx.detail({ enabled: input.enabled === true });
    return { enabled: input.enabled === true };
  },
  { auditAs: "agent.toggle", objectRef: (i) => `agent:${i?.agentId ?? ""}` },
);

export type PlaygroundError =
  AiError | "forbidden" | "invalid" | "not_found" | "rate_limited" | "unknown_agent";
export type PlaygroundResult =
  | { ok: true; value: PlaygroundOutput; provider: "fake" | "openrouter" }
  | {
      ok: false;
      error: PlaygroundError;
      message: string;
      sanitizedInput: string | null;
      costBrl: number;
      latencyMs: number;
    };

const PLAYGROUND_PER_HOUR = 60;

/**
 * Playground (O15): roda o agente com a versão de prompt e o modelo escolhidos sobre um texto de
 * teste. Sempre por `callAgent` (sanitização, delimitadores de dados, flag, orçamento,
 * `ai_calls` marcada `playground`); nunca grava em `articles` nem em tabela editorial. Em
 * teste e CI o provedor é o falso. `deps` só existe para testes.
 */
export async function playground(
  input: { agentId: string; promptVersion: number; modelId: string; input: string },
  deps?: AiDeps,
): Promise<PlaygroundResult> {
  const refuse = (
    error: PlaygroundError,
    message: string,
    sanitizedInput: string | null = null,
  ): PlaygroundResult => ({ ok: false, error, message, sanitizedInput, costBrl: 0, latencyMs: 0 });
  const ctx = await studioContext();
  const session = ctx.session;
  if (!session) return refuse("forbidden", T.forbidden);
  const objectRef = `agent:${String(input?.agentId ?? "")}`;
  if (!canAccess(session.roles, PROMPT_ROLES)) {
    await audit(session.userId, "prompt.playground.denied", objectRef, {}, ctx.db);
    return refuse("forbidden", T.forbidden);
  }
  if (!isPlaygroundAgent(input.agentId)) return refuse("unknown_agent", T.unknownAgent);
  const text = String(input.input ?? "");
  if (text.trim() === "") return refuse("invalid", T.inputRequired);

  const [prompt, model] = await Promise.all([
    ctx.db
      .from("ai_prompts")
      .select("version, body")
      .eq("agent_id", input.agentId)
      .eq("version", Number(input.promptVersion))
      .maybeSingle(),
    ctx.db
      .from("ai_models")
      .select("id, max_tokens, temperature, cost_per_1k_in, cost_per_1k_out, status")
      .eq("id", String(input.modelId))
      .maybeSingle(),
  ]);
  if (prompt.error) throw new Error(`playground: ${prompt.error.message}`);
  if (model.error) throw new Error(`playground: ${model.error.message}`);
  if (!prompt.data) return refuse("not_found", T.promptNotFound);
  if (!model.data) return refuse("not_found", T.modelNotFound);
  if (model.data.status !== "active") return refuse("invalid", T.modelInactive);

  const key = createHash("sha256").update(session.userId).digest("hex").slice(0, 32);
  const limit = await createServiceClient().rpc("hit_rate_limit", {
    p_bucket: "playground",
    p_key_hash: key,
    p_limit: PLAYGROUND_PER_HOUR,
    p_window_seconds: 3600,
  });
  if (limit.error) throw new Error(`playground: ${limit.error.message}`);
  if (limit.data !== true) return refuse("rate_limited", T.rateLimited);

  const ai = deps ?? productionAiDeps();
  const run = await runPlayground(ai, {
    agentId: input.agentId,
    prompt: { version: prompt.data.version, body: prompt.data.body },
    model: {
      id: model.data.id,
      maxTokens: model.data.max_tokens,
      temperature: model.data.temperature === null ? null : Number(model.data.temperature),
      costPer1kIn: Number(model.data.cost_per_1k_in ?? 0),
      costPer1kOut: Number(model.data.cost_per_1k_out ?? 0),
      active: true,
    },
    input: text,
  });
  await audit(
    session.userId,
    "prompt.playground",
    objectRef,
    {
      promptVersion: prompt.data.version,
      modelId: model.data.id,
      ok: run.ok,
      costBrl: run.ok ? run.value.costBrl : run.costBrl,
    },
    ctx.db,
  );
  if (run.ok) return { ok: true, value: run.value, provider: ai.provider.kind };
  return {
    ok: false,
    error: run.error,
    message: T.playgroundError[run.error],
    sanitizedInput: run.sanitizedInput,
    costBrl: run.costBrl,
    latencyMs: run.latencyMs,
  };
}
