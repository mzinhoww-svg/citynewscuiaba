// @vitest-environment node
// P5-T3: pausa automática de fonte e leituras do Control Center (migration 0027).
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { AUDIT_ACTIONS } from "@/lib/audit/actions";
import { pipelineTrash, purgePipeline } from "./cleanup";
import { clientOf, service } from "./studio";

const slug = `teste-auto-${randomUUID().slice(0, 8)}`;
const trash = pipelineTrash();
trash.itemRefLike.add(`source:${slug}`);
let sourceId = "";

async function fail(message = "HTTP 503 em https://exemplo.test/feed") {
  const { error } = await service.from("pipeline_events").insert({
    step: "fetch",
    item_ref: `source:${slug}`,
    level: "error",
    message,
    details: { attempt: 1 },
  });
  if (error) throw error;
}

async function state() {
  const { data, error } = await service
    .from("sources")
    .select("status, auto_paused_at, fetch_reset_at, last_error")
    .eq("id", sourceId)
    .single();
  if (error) throw error;
  return data;
}

afterAll(async () => {
  await purgePipeline(service, trash);
  await service.from("notifications").delete().eq("object_ref", `source:${slug}`);
  if (sourceId) await service.from("sources").delete().eq("id", sourceId);
});

describe("pausa automática por 3 falhas seguidas", () => {
  it("pausa na 3ª falha, avisa o Control Center e reativar zera a contagem", async () => {
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
      })
      .select("id")
      .single();
    if (error) throw error;
    sourceId = data.id;

    await fail();
    await fail();
    expect((await state()).status).toBe("active");
    await fail("connect ECONNREFUSED 203.0.113.9:443");
    const paused = await state();
    expect(paused.status).toBe("paused");
    expect(paused.auto_paused_at).not.toBeNull();
    expect(paused.last_error).toMatch(/Pausada automaticamente depois de 3 falhas seguidas/);
    const { data: notes } = await service
      .from("notifications")
      .select("kind, channel")
      .eq("object_ref", `source:${slug}`);
    expect(notes).toEqual([{ kind: "source_auto_paused", channel: "control_center" }]);

    const { data: health } = await service.rpc("control_source_health");
    const row = health?.find((h) => h.slug === slug);
    expect(row).toMatchObject({ status: "paused", consecutive_failures: 3 });
    expect(row?.auto_paused_at).not.toBeNull();

    await service.from("sources").update({ status: "active" }).eq("id", sourceId);
    const again = await state();
    expect(again.auto_paused_at).toBeNull();
    expect(again.fetch_reset_at).not.toBeNull();
    await fail();
    expect((await state()).status).toBe("active");
  });

  it("evento de seed não pausa", async () => {
    await service.from("sources").update({ status: "active" }).eq("id", sourceId);
    for (let i = 0; i < 3; i++)
      await service.from("pipeline_events").insert({
        step: "fetch",
        item_ref: `source:${slug}`,
        level: "error",
        message: "seed",
        details: { seed: true },
      });
    expect((await state()).status).toBe("active");
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
    ]) {
      expect(AUDIT_ACTIONS).toContain(a);
      expect(data).toContain(a);
    }
  });
});
