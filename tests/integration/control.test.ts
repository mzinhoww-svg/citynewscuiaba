// @vitest-environment node
// P5-T3: leituras do Control Center (migration 0027) sobre o estado do painel de fontes (R8).
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { AUDIT_ACTIONS } from "@/lib/audit/actions";
import { pipelineTrash, purgePipeline } from "./cleanup";
import { clientOf, service } from "./studio";

const slug = `teste-auto-${randomUUID().slice(0, 8)}`;
const trash = pipelineTrash();
trash.itemRefLike.add(`source:${slug}`);
let sourceId = "";

afterAll(async () => {
  await purgePipeline(service, trash);
  if (sourceId) await service.from("sources").delete().eq("id", sourceId);
});

describe("pausa automática: vale a do painel de fontes (R8)", () => {
  it("a 0027 não cria trigger nem coluna própria de pausa automática", async () => {
    const cols = await service.from("sources").select("auto_paused_at").limit(1);
    expect(cols.error?.code).toBe("42703");
    const reset = await service.from("sources").select("fetch_reset_at").limit(1);
    expect(reset.error?.code).toBe("42703");
    const fn = await service.rpc("source_consecutive_failures" as never, {} as never);
    expect(fn.error?.code).toBe("PGRST202");
  });

  it("a saúde das fontes lê status, motivo e falhas seguidas do painel", async () => {
    const { data, error } = await service
      .from("sources")
      .insert({
        slug,
        name: `Fonte de teste ${slug}`,
        base_url: "https://exemplo.test",
        kind: "rss",
        feed_url: "https://exemplo.test/feed",
        locality: "cuiaba",
        status: "active",
        // Retomar (paused → active) exige termos revisados (painel, 0011).
        terms_reviewed_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (error) throw error;
    sourceId = data.id;

    // Erros de coleta ficam nos eventos (errors_24h); o estado é o que `afterFetch` grava.
    for (let i = 0; i < 3; i++) {
      const { error: e } = await service.from("pipeline_events").insert({
        step: "fetch",
        item_ref: `source:${slug}`,
        level: "error",
        message: "HTTP 503 em https://exemplo.test/feed",
        details: { attempt: i + 1 },
      });
      if (e) throw e;
    }
    const { error: up } = await service
      .from("sources")
      .update({
        status: "paused",
        status_reason: "auto_failures",
        consecutive_failures: 3,
        last_error: "HTTP 503 em https://exemplo.test/feed",
      })
      .eq("id", sourceId);
    if (up) throw up;

    const { data: health, error: he } = await service.rpc("control_source_health");
    expect(he).toBeNull();
    const row = health?.find((h) => h.slug === slug);
    expect(row).toMatchObject({
      status: "paused",
      status_reason: "auto_failures",
      consecutive_failures: 3,
      errors_24h: 3,
      last_error: "HTTP 503 em https://exemplo.test/feed",
    });

    // Retomar pelo painel zera a contagem; a saúde acompanha.
    const { error: back } = await service
      .from("sources")
      .update({ status: "active", status_reason: null, consecutive_failures: 0 })
      .eq("id", sourceId);
    if (back) throw back;
    const { data: again } = await service.rpc("control_source_health");
    expect(again?.find((h) => h.slug === slug)).toMatchObject({
      status: "active",
      status_reason: null,
      consecutive_failures: 0,
    });
  });
});

describe("leituras do Control Center por papel", () => {
  it("quem tem metrics.view lê a saúde das fontes e a fila; jornalista não", async () => {
    const analista = await clientOf("thiago");
    const ok = await analista.rpc("control_queue_stats");
    expect(ok.error).toBeNull();
    const jornalista = await clientOf("juliana");
    const denied = await jornalista.rpc("control_source_health");
    expect(denied.error?.code).toBe("42501");
  });

  it("mensagens aguardando nova tentativa só para quem opera", async () => {
    const diego = await clientOf("diego");
    expect((await diego.rpc("control_retrying_jobs", { p_limit: 10 })).error).toBeNull();
    const thiago = await clientOf("thiago");
    expect((await thiago.rpc("control_retrying_jobs", { p_limit: 10 })).error?.code).toBe("42501");
  });

  it("as ações novas do Control Center estão na lista do banco", async () => {
    const { data, error } = await service.rpc("studio_audit_actions");
    expect(error).toBeNull();
    for (const a of [
      "pipeline.run_now",
      "pipeline.reprocess",
      "pipeline.quarantine.discard",
      "logs.export",
      "ai.eval.run",
      "ai.eval.case",
      "source.collect_now",
    ]) {
      expect(AUDIT_ACTIONS).toContain(a);
      expect(data).toContain(a);
    }
  });
});
