// @vitest-environment node
// P5-T6: avaliação sob demanda (O14), eval_runs somente inserção e leituras de custo/bases.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createCallAgent } from "@/lib/ai/call-agent";
import { withPromptVersion } from "@/lib/ai/eval";
import { createFakeProvider } from "@/lib/ai/fake";
import { createMemoryAiStore } from "@/lib/ai/testing/memory-store";
import {
  runEvaluationCommand,
  setEvalAiForTests,
  toggleEvalCaseCommand,
} from "@/lib/studio/ai-eval";
import { asUser, clientOf, lastAudit, SEED_USERS, service } from "./studio";

const created: string[] = [];
let lastPrompt: { version: number; body: string } | null = null;

beforeAll(() => {
  setEvalAiForTests((prompt) => {
    lastPrompt = prompt;
    const store = createMemoryAiStore();
    return {
      providerKind: "fake",
      callAgent: createCallAgent({
        store: withPromptVersion(store, "answer", prompt),
        provider: createFakeProvider(),
        now: () => new Date(),
      }),
    };
  });
});

afterAll(async () => {
  setEvalAiForTests(null);
  if (created.length) await service.from("eval_runs").delete().in("id", created);
});

describe("runEvaluationCommand", () => {
  it("operador de IA roda a avaliação com os casos ativos e a rodada fica registrada", async () => {
    const r = await asUser("diego", () => runEvaluationCommand({ agentId: "answer" }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    created.push(r.value.runId);
    expect(r.value.cases).toBe(6);
    expect(r.value.gateFailures).toEqual([]);
    expect(r.value.promptVersion).toBe(1);
    expect(lastPrompt).toBeNull();
    const { data } = await service
      .from("eval_runs")
      .select("provider, trigger, created_by, cases, gate_failures")
      .eq("id", r.value.runId)
      .single();
    expect(data).toEqual({
      provider: "fake",
      trigger: "manual",
      created_by: SEED_USERS.diego.id,
      cases: 6,
      gate_failures: [],
    });
    const audit = await lastAudit(SEED_USERS.diego.id);
    expect(audit?.action).toBe("ai.eval.run");
    expect(audit?.object_ref).toBe(`eval_run:${r.value.runId}`);
  });

  it("versão de prompt inexistente é recusada", async () => {
    const r = await asUser("diego", () =>
      runEvaluationCommand({ agentId: "answer", promptVersion: 99 }),
    );
    expect(r).toMatchObject({ ok: false, error: "not_found" });
  });

  it("analista vê avaliações, mas não roda", async () => {
    const r = await asUser("thiago", () => runEvaluationCommand({ agentId: "answer" }));
    expect(r).toMatchObject({ ok: false, error: "forbidden" });
  });

  it("rodada registrada é imutável", async () => {
    const { error } = await service.from("eval_runs").update({ cases: 0 }).eq("id", created[0]!);
    expect(error?.message).toMatch(/somente inserção/);
  });

  it("desativar um caso tira o caso da próxima rodada", async () => {
    const { data: c } = await service
      .from("eval_cases")
      .select("id")
      .eq("case_key", "sem-fontes")
      .single();
    const off = await asUser("diego", () => toggleEvalCaseCommand({ id: c!.id, active: false }));
    expect(off.ok).toBe(true);
    const r = await asUser("diego", () => runEvaluationCommand({ agentId: "answer" }));
    if (r.ok) created.push(r.value.runId);
    expect(r.ok && r.value.cases).toBe(5);
    await asUser("diego", () => toggleEvalCaseCommand({ id: c!.id, active: true }));
  });
});

describe("leituras da IA por papel", () => {
  it("custo diário: analista lê; moderador não vê chamadas (RLS)", async () => {
    const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const analista = await (await clientOf("thiago")).rpc("ai_cost_daily", { p_since: since });
    expect(analista.error).toBeNull();
    expect((analista.data ?? []).length).toBeGreaterThan(0);
    const moderador = await (await clientOf("carlos")).rpc("ai_cost_daily", { p_since: since });
    expect(moderador.data ?? []).toEqual([]);
  });

  it("bases de conhecimento para metrics.view; jornalista não", async () => {
    const ok = await (await clientOf("thiago")).rpc("ai_knowledge_bases");
    expect(ok.error).toBeNull();
    expect(ok.data?.map((b) => b.base)).toEqual([
      "articles",
      "aggregated",
      "topics",
      "events",
      "sources",
    ]);
    const denied = await (await clientOf("juliana")).rpc("ai_knowledge_bases");
    expect(denied.error?.code).toBe("42501");
  });
});
