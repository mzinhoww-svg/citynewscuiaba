// @vitest-environment node
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { createCallAgent } from "@/lib/ai/call-agent";
import { createFakeProvider } from "@/lib/ai/fake";
import { ClassifySchema } from "@/lib/ai/schemas";
import type { AiStore } from "@/lib/ai/types";
import { createAiStore } from "@/lib/db/ai-store";
import { createServiceClient } from "@/lib/db/client";

const db = createServiceClient();
const agentTag = `teste-${randomUUID().slice(0, 8)}`;

afterAll(async () => {
  await db.from("ai_calls").delete().like("agent_id", `${agentTag}%`);
  await db.from("ai_calls").delete().eq("model_id", `modelo-${agentTag}`);
});

describe("registro de IA no banco", () => {
  it("carrega agente, modelos e prompt aprovado da migration 0006", async () => {
    const store = createAiStore(db);
    const a = await store.agent("classify");
    expect(a).toMatchObject({
      id: "classify",
      enabled: true,
      dailyBudgetBrl: 3,
      model: { id: "google/gemini-2.5-flash", active: true, costPer1kIn: 0.00165 },
      fallback: { id: "openai/gpt-4o-mini" },
      prompt: { version: 1 },
    });
    expect(a?.prompt?.body).toMatch(/CityNews/);
    expect(await store.agent("embed")).toMatchObject({ prompt: null, fallback: null });
    expect(await store.agent("nao-existe")).toBeNull();
    expect(await store.aiEnabled()).toBe(true);
  });

  it("registra chamadas e soma o gasto desde um instante", async () => {
    const store = createAiStore(db);
    const since = new Date(Date.now() - 60_000);
    const row = {
      agent_id: agentTag,
      model_id: `modelo-${agentTag}`,
      prompt_version: 1,
      latency_ms: 10,
      tokens_in: 100,
      tokens_out: 10,
      cost_brl: 0.000123,
      ok: true,
      fallback_used: false,
      error: null,
    };
    await store.recordCall(row);
    await store.recordCall({ ...row, cost_brl: 0.5 });
    const spend = await store.spendSince(since);
    expect(spend[agentTag]).toBeCloseTo(0.500123, 6);
  });

  it("callAgent com banco real grava ai_calls com fallback", async () => {
    const real = createAiStore(db);
    // Agente real, gasto isolado: as linhas deste teste usam um agent_id próprio.
    const store: AiStore = {
      agent: async (id) => {
        const a = await real.agent(id);
        return a ? { ...a, id: `${agentTag}-${id}` } : null;
      },
      aiEnabled: () => real.aiEnabled(),
      spendSince: (s) => real.spendSince(s),
      recordCall: (r) => real.recordCall(r),
    };
    const fake = createFakeProvider();
    fake.script([
      { model: "google/gemini-2.5-flash", error: "timeout" },
      {
        model: "openai/gpt-4o-mini",
        output: { section: "cidade", relevance: 0.6, sensitive: false, tags: [] },
      },
    ]);
    const callAgent = createCallAgent({ store, provider: fake, now: () => new Date() });
    const r = await callAgent(
      "classify",
      {
        system: "",
        data: [{ id: "i1", text: "Linha de ônibus nova no CPA." }],
        task: "Classifique.",
      },
      ClassifySchema,
    );
    expect(r.ok).toBe(true);
    const { data } = await db
      .from("ai_calls")
      .select("model_id, ok, error, fallback_used, prompt_version")
      .eq("agent_id", `${agentTag}-classify`)
      .order("id");
    expect(data).toEqual([
      {
        model_id: "google/gemini-2.5-flash",
        ok: false,
        error: "timeout",
        fallback_used: false,
        prompt_version: 1,
      },
      {
        model_id: "openai/gpt-4o-mini",
        ok: true,
        error: null,
        fallback_used: true,
        prompt_version: 1,
      },
    ]);
  });
});
