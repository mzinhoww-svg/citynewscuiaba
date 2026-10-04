// @vitest-environment node
// P5-T5 · Prompts versionados e playground (banco real): publicar sem aprovação falha; quem pede
// não publica; aprovação de outra pessoa publica e arquiva a anterior; rollback cria versão nova
// e marca a anterior `reverted`; playground nunca grava em `articles`; orçamentos dentro do teto
// (write R$ 9 + source_profiler R$ 1 + reviewer R$ 1 = R$ 30, A-056 e AUT-T6).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createCallAgent } from "@/lib/ai/call-agent";
import { createFakeProvider } from "@/lib/ai/fake";
import { createMemoryAiStore } from "@/lib/ai/testing/memory-store";
import type { AiCallRow, AiModel } from "@/lib/ai/types";
import { AUDIT_ACTIONS } from "@/lib/audit/actions";
import {
  createPromptVersionCommand,
  playgroundCommand,
  publishPromptCommand,
  requestPromptPublishCommand,
  rollbackPromptCommand,
  setPlaygroundAiForTests,
  updateAgentCommand,
  updateModelCommand,
  withOverrides,
} from "@/lib/studio/ai-prompts";
import { decideApprovalCommand } from "@/lib/studio/approvals";
import { asUser, clientOf, SEED_USERS, service } from "./studio";

/** Agente com regressão e prompt v1 do seed; a suíte cria versões acima de 1 e apaga no fim. */
const AGENT = "image";
const approvals: string[] = [];
let lastOverride: {
  prompt: { version: number; body: string } | null;
  model: AiModel | null;
} | null = null;

beforeAll(async () => {
  setPlaygroundAiForTests((over) => {
    lastOverride = { prompt: over.prompt, model: over.model };
    const calls: AiCallRow[] = [];
    const store = withOverrides(createMemoryAiStore(), over.prompt?.agentId ?? "", over, calls);
    return {
      providerKind: "fake",
      callAgent: createCallAgent({ store, provider: createFakeProvider(), now: () => new Date() }),
      calls: () => calls,
    };
  });
});

afterAll(async () => {
  setPlaygroundAiForTests(null);
  // Devolve a v1 do seed à produção e apaga as versões da suíte.
  await service
    .from("ai_prompts")
    .update({ status: "production" })
    .eq("agent_id", AGENT)
    .eq("version", 1);
  await service.from("ai_prompts").delete().eq("agent_id", AGENT).gt("version", 1);
  await service.from("ai_agents").update({ prompt_version: 1 }).eq("id", AGENT);
  if (approvals.length) await service.from("approvals").delete().in("id", approvals);
  await service.from("ai_agents").update({ daily_budget_brl: 2, enabled: true }).eq("id", AGENT);
  await service.from("ai_models").update({ status: "active" }).eq("id", "openai/gpt-4o-mini");
});

async function version(v: number) {
  const { data } = await service
    .from("ai_prompts")
    .select("version, status, approved_by, author_id")
    .eq("agent_id", AGENT)
    .eq("version", v)
    .maybeSingle();
  return data;
}

describe("prompts versionados (banco real)", () => {
  it("as ações de auditoria novas estão nas duas listas", async () => {
    const r = await service.rpc("studio_audit_actions");
    for (const a of ["prompt.create", "prompt.request", "prompt.rollback", "ai.playground.run"]) {
      expect(AUDIT_ACTIONS).toContain(a);
      expect(r.data).toContain(a);
    }
  });

  it("orçamentos do seed: write R$ 9, source_profiler R$ 1, reviewer R$ 1, total R$ 30; o banco recusa passar do teto", async () => {
    const { data } = await service.from("ai_agents").select("id, daily_budget_brl");
    const by = new Map((data ?? []).map((a) => [a.id, Number(a.daily_budget_brl)]));
    expect(by.get("write")).toBe(9);
    expect(by.get("source_profiler")).toBe(1);
    expect(by.get("reviewer")).toBe(1);
    expect([...by.values()].reduce((s, x) => s + x, 0)).toBe(30);
    const over = await service.from("ai_agents").update({ daily_budget_brl: 3 }).eq("id", AGENT);
    expect(over.error?.code).toBe("23514");
  });

  it("só quem tem o papel de operador cria versão; editor-chefe não", async () => {
    const m = await asUser("marina", () =>
      createPromptVersionCommand({ agentId: AGENT, body: "Texto novo", rationale: "teste" }),
    );
    expect(m).toMatchObject({ ok: false, error: "forbidden" });
  });

  let v2 = 0;
  let approvalId = "";

  it("operador cria rascunho v2 e pede publicação; publicar sem aprovação falha", async () => {
    const r = await asUser("diego", () =>
      createPromptVersionCommand({
        agentId: AGENT,
        body: "Você decide se o assunto pode ter ilustração gerada. Nunca para crime, tragédia, acidente ou saúde individual. Sempre descreva o texto alternativo.",
        rationale: "Texto alternativo obrigatório",
      }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    v2 = r.value.version;
    expect(v2).toBeGreaterThan(1);
    expect(await version(v2)).toMatchObject({ status: "draft", author_id: SEED_USERS.diego.id });

    const req = await asUser("diego", () =>
      requestPromptPublishCommand({
        agentId: AGENT,
        version: v2,
        justification: "Alt obrigatório",
      }),
    );
    expect(req.ok).toBe(true);
    if (!req.ok) return;
    approvalId = req.value.approvalId;
    approvals.push(approvalId);
    expect((await version(v2))?.status).toBe("pending");

    // Sem aprovação: nem quem pediu, nem o banco direto.
    const self = await asUser("diego", () => publishPromptCommand({ approvalId }));
    expect(self).toMatchObject({ ok: false, error: "forbidden" });
    const direct = await service.rpc("prompt_publish", { p_approval: approvalId });
    expect(direct.error?.code).toBe("42501");
    expect((await version(v2))?.status).toBe("pending");
    // Direto na tabela, o próprio autor não põe em produção (guard_ai_prompts).
    const diego = await clientOf("diego");
    const forced = await diego
      .from("ai_prompts")
      .update({ status: "production" })
      .eq("agent_id", AGENT)
      .eq("version", v2)
      .select("id");
    expect(forced.error ?? forced.data).not.toEqual([{ id: expect.any(String) }]);
    expect((await version(v2))?.status).toBe("pending");
  });

  it("editora-chefe aprova na caixa (só registra) e publica: v2 em produção, v1 arquivada", async () => {
    const dec = await asUser("marina", () =>
      decideApprovalCommand({ id: approvalId, decision: "approve" }),
    );
    expect(dec).toMatchObject({ ok: true, value: { applied: false } });
    // Quem pediu ainda não publica, mesmo com o pedido aprovado.
    const self = await asUser("diego", () => publishPromptCommand({ approvalId }));
    expect(self).toMatchObject({ ok: false, error: "forbidden" });
    // Outra pessoa com o papel, mas que não aprovou, também não (só quem aprovou aplica).
    const other = await asUser("helena", () => publishPromptCommand({ approvalId }));
    expect(other).toMatchObject({ ok: false, error: "forbidden" });

    const pub = await asUser("marina", () => publishPromptCommand({ approvalId }));
    expect(pub).toMatchObject({ ok: true, value: { agentId: AGENT, version: v2, previous: 1 } });
    expect(await version(v2)).toMatchObject({
      status: "production",
      approved_by: [SEED_USERS.marina.id],
    });
    expect((await version(1))?.status).toBe("archived");
    const agent = await service.from("ai_agents").select("prompt_version").eq("id", AGENT).single();
    expect(agent.data?.prompt_version).toBe(v2);
    const ap = await service.from("approvals").select("status").eq("id", approvalId).single();
    expect(ap.data?.status).toBe("applied");
    const audit = await service
      .from("audit_log")
      .select("actor, action")
      .eq("details->>approvalId", approvalId)
      .order("id");
    expect(audit.data).toEqual(
      expect.arrayContaining([
        { actor: SEED_USERS.diego.id, action: "prompt.request" },
        { actor: SEED_USERS.marina.id, action: "approval.approved" },
        { actor: SEED_USERS.marina.id, action: "approval.applied" },
      ]),
    );
  });

  it("rollback para a v1 cria v3 em produção e marca v2 como reverted; operador não faz rollback", async () => {
    const no = await asUser("diego", () => rollbackPromptCommand({ agentId: AGENT, toVersion: 1 }));
    expect(no).toMatchObject({ ok: false, error: "forbidden" });
    const r = await asUser("helena", () => rollbackPromptCommand({ agentId: AGENT, toVersion: 1 }));
    expect(r, JSON.stringify(r)).toMatchObject({
      ok: true,
      value: { from: v2, to: 1, version: v2 + 1 },
    });
    expect((await version(v2))?.status).toBe("reverted");
    expect((await version(v2 + 1))?.status).toBe("production");
    const v1 = await service
      .from("ai_prompts")
      .select("body")
      .eq("agent_id", AGENT)
      .eq("version", 1)
      .single();
    const v3 = await service
      .from("ai_prompts")
      .select("body")
      .eq("agent_id", AGENT)
      .eq("version", v2 + 1)
      .single();
    expect(v3.data?.body).toBe(v1.data?.body);
    // Rascunho ou pendente não é destino de rollback.
    const bad = await asUser("helena", () =>
      rollbackPromptCommand({ agentId: AGENT, toVersion: v2 + 1 }),
    );
    expect(bad).toMatchObject({ ok: false, error: "forbidden" });
  });
});

describe("playground (banco real, provedor falso)", () => {
  it("roda com a versão e o modelo escolhidos e nunca grava em articles", async () => {
    const before = await service.from("articles").select("id", { count: "exact", head: true });
    const r = await asUser("diego", () =>
      playgroundCommand({
        agentId: "classify",
        promptVersion: 1,
        modelId: "openai/gpt-4o-mini",
        task: "Classifique o item.",
        data: [{ id: "item-1", text: "<p>Vacinação contra a gripe nas UPAs de Cuiabá.</p>" }],
      }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.valid).toBe(true);
    expect(r.value.output).toMatchObject({ section: "saude" });
    expect(r.value.sanitizedInput[0]?.text).not.toContain("<p>");
    expect(r.value.providerKind).toBe("fake");
    expect(r.value.promptVersion).toBe(1);
    expect(r.value.modelId).toBe("openai/gpt-4o-mini");
    expect(lastOverride?.model?.id).toBe("openai/gpt-4o-mini");
    expect(r.value.costBrl).toBeGreaterThan(0);
    const after = await service.from("articles").select("id", { count: "exact", head: true });
    expect(after.count).toBe(before.count);
    const audit = await service
      .from("audit_log")
      .select("action, details")
      .eq("actor", SEED_USERS.diego.id)
      .eq("action", "ai.playground.run")
      .order("id", { ascending: false })
      .limit(1)
      .single();
    expect(audit.data?.details).toMatchObject({ provider: "fake", valid: true });
    expect(JSON.stringify(audit.data?.details)).not.toMatch(/sk-or-|OPENROUTER/);
  });

  it("analista não roda; entrada vazia é inválida", async () => {
    const no = await asUser("thiago", () =>
      playgroundCommand({ agentId: "classify", task: "x", data: [{ id: "a", text: "b" }] }),
    );
    expect(no).toMatchObject({ ok: false, error: "forbidden" });
    const empty = await asUser("diego", () =>
      playgroundCommand({ agentId: "classify", task: "x", data: [] }),
    );
    expect(empty).toMatchObject({ ok: false, error: "invalid" });
  });
});

describe("agentes e modelos", () => {
  it("orçamento acima do teto é recusado; edição válida audita antes e depois", async () => {
    const over = await asUser("diego", () =>
      updateAgentCommand({
        id: AGENT,
        enabled: true,
        dailyBudgetBrl: 3,
        modelId: "google/gemini-2.5-flash",
        fallbackModelId: "openai/gpt-4o-mini",
      }),
    );
    expect(over).toMatchObject({ ok: false, error: "invalid" });
    const ok = await asUser("diego", () =>
      updateAgentCommand({
        id: AGENT,
        enabled: false,
        dailyBudgetBrl: 1.5,
        modelId: "google/gemini-2.5-flash",
        fallbackModelId: null,
      }),
    );
    expect(ok.ok).toBe(true);
    const row = await service
      .from("ai_agents")
      .select("enabled, daily_budget_brl, fallback_model_id")
      .eq("id", AGENT)
      .single();
    expect(row.data).toMatchObject({ enabled: false, fallback_model_id: null });
    expect(Number(row.data?.daily_budget_brl)).toBe(1.5);
    // Editora-chefe não administra agentes (RLS admin/operador_ia).
    const m = await asUser("marina", () =>
      updateAgentCommand({
        id: AGENT,
        enabled: true,
        dailyBudgetBrl: 2,
        modelId: "google/gemini-2.5-flash",
        fallbackModelId: "openai/gpt-4o-mini",
      }),
    );
    expect(m).toMatchObject({ ok: false, error: "forbidden" });
  });

  it("modelo principal de agente ligado não desativa; fallback livre desativa e volta", async () => {
    const busy = await asUser("helena", () =>
      updateModelCommand({ id: "google/gemini-2.5-flash", active: false }),
    );
    expect(busy).toMatchObject({ ok: false, error: "conflict" });
    const off = await asUser("helena", () =>
      updateModelCommand({ id: "openai/gpt-4o-mini", active: false }),
    );
    expect(off.ok).toBe(true);
    const row = await service
      .from("ai_models")
      .select("status")
      .eq("id", "openai/gpt-4o-mini")
      .single();
    expect(row.data?.status).toBe("inactive");
    const on = await asUser("helena", () =>
      updateModelCommand({ id: "openai/gpt-4o-mini", active: true }),
    );
    expect(on.ok).toBe(true);
  });
});
