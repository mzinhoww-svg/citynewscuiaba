// @vitest-environment node
// Motor de autonomia no banco (A-134, 0152): disjuntor que se recupera sozinho, matérias com
// próxima ação vencida, falha de IA que o modelo reserva recuperou não conta, saúde da fila.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServiceClient } from "@/lib/db/client";

const service = createServiceClient();
const ids: string[] = [];
let breakerBefore: Record<string, unknown> | null = null;
let autoPublishBefore = false;

beforeAll(async () => {
  const { data } = await service.from("publish_breaker").select("*").eq("id", true).single();
  breakerBefore = data;
  const flag = await service
    .from("feature_flags")
    .select("enabled")
    .eq("key", "auto_publish")
    .single();
  autoPublishBefore = flag.data?.enabled ?? false;
});

afterAll(async () => {
  if (ids.length) await service.from("articles").delete().in("id", ids);
  await service
    .from("publish_breaker")
    .update({
      tripped_at: null,
      trip_reason: null,
      disabled_by_trip: false,
      reset_at: (breakerBefore?.reset_at as string | null) ?? null,
    })
    .eq("id", true);
  await service
    .from("feature_flags")
    .update({ enabled: autoPublishBefore })
    .eq("key", "auto_publish");
});

async function draft(over: Record<string, unknown> = {}) {
  const id = randomUUID();
  ids.push(id);
  const r = await service.from("articles").insert({
    id,
    slug: `autonomia-${id.slice(0, 8)}`,
    kind: "normalized",
    section_slug: "cidade",
    title: "Teste do motor",
    dek: "Linha fina",
    body: { type: "doc", content: [] },
    status: "draft",
    ...over,
  });
  if (r.error) throw r.error;
  return id;
}

describe("matérias com próxima ação", () => {
  it("a varredura recebe só rascunho vencido, fora da quarentena e sem pessoa", async () => {
    const due = await draft({
      next_action: "rewrite",
      next_attempt_at: new Date(Date.now() - 60_000).toISOString(),
      ai_fallback: true,
    });
    const later = await draft({
      next_action: "reevaluate",
      next_attempt_at: new Date(Date.now() + 3_600_000).toISOString(),
    });
    const quarantined = await draft({
      next_action: "reevaluate",
      next_attempt_at: new Date(Date.now() - 60_000).toISOString(),
      quarantined_at: new Date().toISOString(),
    });
    const { data, error } = await service.rpc("autonomy_due_articles", { p_limit: 500 });
    expect(error).toBeNull();
    const got = (data ?? []).map((r) => r.id);
    expect(got).toContain(due);
    expect(got).not.toContain(later);
    expect(got).not.toContain(quarantined);
    expect(data!.find((r) => r.id === due)).toMatchObject({
      next_action: "rewrite",
      ai_fallback: true,
    });
    await service.rpc("autonomy_claim_article", { p_id: due });
    const again = await service.rpc("autonomy_due_articles", { p_limit: 500 });
    expect((again.data ?? []).map((r) => r.id)).not.toContain(due);
  });

  it("estado do motor tem valores válidos", async () => {
    const id = await draft();
    const bad = await service
      .from("articles")
      .update({ next_action: "esperar_pessoa" })
      .eq("id", id);
    expect(bad.error).not.toBeNull();
    const badLevel = await service.from("articles").update({ autonomy_level: "A9" }).eq("id", id);
    expect(badLevel.error).not.toBeNull();
  });
});

describe("disjuntor que se recupera", () => {
  it("TRIP → resfriamento → AUTO-RECOVER: religa o que ele mesmo desligou e libera as seguradas", async () => {
    await service.from("feature_flags").update({ enabled: true }).eq("key", "auto_publish");
    await service
      .from("publish_breaker")
      .update({ tripped_at: null, trip_reason: null, cooldown_minutes: 30, auto_resume: true })
      .eq("id", true);
    const tripped = await service.rpc("publish_breaker_trip", { p_reason: "hourly", p_detail: {} });
    expect(tripped.data).toBe(true);
    const flagOff = await service
      .from("feature_flags")
      .select("enabled")
      .eq("key", "auto_publish")
      .single();
    expect(flagOff.data?.enabled).toBe(false);
    const held = await draft({
      next_action: "breaker_recovery",
      next_attempt_at: new Date(Date.now() + 3_600_000).toISOString(),
    });

    const early = await service.rpc("publish_breaker_auto_recover", {});
    expect(early.data).toMatchObject({ recovered: false, reason: "cooldown" });

    const later = new Date(Date.now() + 31 * 60_000).toISOString();
    const r = await service.rpc("publish_breaker_auto_recover", { p_now: later });
    expect(r.error).toBeNull();
    expect(r.data).toMatchObject({ recovered: true, autoPublishRestored: true });
    const flagOn = await service
      .from("feature_flags")
      .select("enabled")
      .eq("key", "auto_publish")
      .single();
    expect(flagOn.data?.enabled).toBe(true);
    const a = await service.from("articles").select("next_attempt_at").eq("id", held).single();
    expect(Date.parse(a.data!.next_attempt_at!)).toBeLessThanOrEqual(Date.parse(later));
    const audit = await service
      .from("audit_log")
      .select("actor")
      .eq("action", "breaker.auto_recover")
      .order("id", { ascending: false })
      .limit(1)
      .single();
    expect(audit.data?.actor).toBe("system");
  });

  it("publicação desligada pelo dono (não pelo disjuntor) não é religada sozinha", async () => {
    await service.from("feature_flags").update({ enabled: false }).eq("key", "auto_publish");
    await service.from("publish_breaker").update({ tripped_at: null }).eq("id", true);
    await service.rpc("publish_breaker_trip", { p_reason: "reports", p_detail: {} });
    const r = await service.rpc("publish_breaker_auto_recover", {
      p_now: new Date(Date.now() + 31 * 60_000).toISOString(),
    });
    expect(r.data).toMatchObject({ recovered: true, autoPublishRestored: false });
    const flag = await service
      .from("feature_flags")
      .select("enabled")
      .eq("key", "auto_publish")
      .single();
    expect(flag.data?.enabled).toBe(false);
  });
});

describe("saúde da fila", () => {
  it("devolve as métricas de diagnóstico", async () => {
    const { data, error } = await service.rpc("autonomy_queue_health", {});
    expect(error).toBeNull();
    for (const k of [
      "queueDepth",
      "oldestAgeSec",
      "retrying",
      "deadLetters",
      "failuresLastHour",
      "reprocessing",
      "quarantined24h",
      "humanExceptions",
      "openIncidents",
    ])
      expect(data).toHaveProperty(k);
  });
});
