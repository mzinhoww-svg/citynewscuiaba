// @vitest-environment node
// P5-T6 · Regressão da IA pelo Estúdio: papel, registro em ai_eval_runs (RLS) e auditoria.
import { afterAll, describe, expect, it } from "vitest";
import { executeRegression } from "@/lib/ai/eval-run";
import { asUser, clientOf, SEED_USERS, service } from "./studio";

const DIEGO = SEED_USERS.diego.id; // operador_ia
const OTAVIO = SEED_USERS.otavio.id; // editor
const started = new Date().toISOString();

afterAll(async () => {
  await service.from("ai_eval_runs").delete().eq("created_by", DIEGO).gte("created_at", started);
});

describe("executeRegression", () => {
  it("operação de IA executa, grava a execução em nome próprio e audita", async () => {
    const r = await asUser("diego", () =>
      executeRegression({ agentId: "answer", promptVersion: 1 }),
    );
    expect(r).toMatchObject({ ok: true, promptVersion: 1 });
    if (!r.ok) return;
    expect(r.metrics.cases).toBe(5);
    const row = await service.from("ai_eval_runs").select("*").eq("id", r.id).single();
    expect(row.data).toMatchObject({
      agent_id: "answer",
      prompt_version: 1,
      provider: "fake",
      case_count: 5,
      created_by: DIEGO,
    });
    const log = await service
      .from("audit_log")
      .select("action, details")
      .eq("actor", DIEGO)
      .eq("action", "prompt.playground")
      .gte("at", started);
    expect(log.data?.some((l) => (l.details as { eval?: boolean }).eval === true)).toBe(true);
  });

  it("versão inexistente e agente sem contrato não gravam nada", async () => {
    const before = await service.from("ai_eval_runs").select("id", { count: "exact", head: true });
    const missing = await asUser("diego", () =>
      executeRegression({ agentId: "answer", promptVersion: 9999 }),
    );
    expect(missing).toMatchObject({ ok: false, error: "not_found" });
    const other = await asUser("diego", () =>
      executeRegression({ agentId: "classify", promptVersion: 1 }),
    );
    expect(other).toMatchObject({ ok: false, error: "unknown_agent" });
    const after = await service.from("ai_eval_runs").select("id", { count: "exact", head: true });
    expect(after.count).toBe(before.count);
  });

  it("quem não é da IA é recusado e a negação fica auditada", async () => {
    const r = await asUser("otavio", () =>
      executeRegression({ agentId: "answer", promptVersion: 1 }),
    );
    expect(r).toMatchObject({ ok: false, error: "forbidden" });
    const rows = await service.from("ai_eval_runs").select("id").eq("created_by", OTAVIO);
    expect(rows.data).toEqual([]);
  });

  it("a RLS não deixa gravar em nome de outra pessoa", async () => {
    const db = await clientOf("diego");
    const r = await db.from("ai_eval_runs").insert({
      agent_id: "answer",
      prompt_version: 1,
      provider: "fake",
      case_count: 0,
      metrics: {},
      created_by: OTAVIO,
    });
    expect(r.error).not.toBeNull();
  });
});
