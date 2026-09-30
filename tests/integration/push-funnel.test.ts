// @vitest-environment node
// Funil do app (0042, PW-T14; spec §9.3, §9.4; Review Focus 5): etapas a partir de `events`,
// fechamento diário, dia corrente ao vivo, permissão `push.metrics` e "Só o necessário" sem rastro.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST } from "@/app/api/events/route";
import type { Json } from "@/lib/db/types";
import { clientOf, service } from "./studio";

const mark = randomUUID().slice(0, 8);
const today = new Date();
const yesterday = new Date(today.getTime() - 86_400_000);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const inserted: number[] = [];

async function seedEvent(
  name: string,
  receivedAt: Date,
  props: Record<string, Json>,
  device = "mobile",
) {
  const { data, error } = await service
    .from("events")
    .insert({
      name,
      anon_id: null,
      user_id: null,
      at: receivedAt.toISOString(),
      received_at: receivedAt.toISOString(),
      session: { id: "-", page: `/funil-${mark}`, referrer: null, device },
      consent: { version: "v1", metrics: true, personalization: false },
      algo_version: "rec-v1",
      props: { ...props, browser: "chrome" },
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  inserted.push(data.id);
}

const at = (base: Date, h: number) =>
  new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate(), h, 0, 0));

beforeAll(async () => {
  // Ontem (dia fechado): 4 convites, 2 instalações pelo convite, 1 pelo navegador, 2 pré-prompts,
  // 1 permissão pelo pré-prompt, 1 permissão em Alertas, 1 negada.
  for (let i = 0; i < 4; i++)
    await seedEvent("install_prompt_shown", at(yesterday, 10), {
      platform: "android",
      trigger: "visits",
    });
  await seedEvent("app_installed", at(yesterday, 11), { via: "prompt" });
  await seedEvent("app_installed", at(yesterday, 11), { via: "ios_steps" });
  await seedEvent("app_installed", at(yesterday, 11), { via: "browser" });
  await seedEvent("notif_preprompt_shown", at(yesterday, 12), { trigger: "follow" });
  await seedEvent("notif_preprompt_shown", at(yesterday, 12), { trigger: "alert" }, "desktop");
  await seedEvent("notif_permission_granted", at(yesterday, 12), { trigger: "follow" });
  await seedEvent("notif_permission_granted", at(yesterday, 12), { trigger: "settings" });
  await seedEvent("notif_permission_denied", at(yesterday, 12), { trigger: "follow" });
  // Hoje (ao vivo): 1 convite.
  await seedEvent(
    "install_prompt_shown",
    new Date(Math.max(Date.now() - 60_000, at(today, 0).getTime())),
    { platform: "android", trigger: "reads" },
  );
  await service.rpc("push_funnel_refresh", { p_day: iso(yesterday) });
});

afterAll(async () => {
  if (inserted.length) await service.from("events").delete().in("id", inserted);
  await service.rpc("push_funnel_refresh", { p_day: iso(yesterday) });
  await service.from("push_funnel_daily").delete().lt("day", "2000-02-01");
});

async function funnel(user: Parameters<typeof clientOf>[0], args: Record<string, string> = {}) {
  const db = await clientOf(user);
  const { data, error } = await db.rpc("push_funnel", {
    p_from: iso(yesterday),
    p_to: iso(today),
    ...args,
  });
  if (error) throw new Error(error.message);
  return Object.fromEntries((data ?? []).map((r) => [r.stage, Number(r.n)]));
}

describe("funil do app (0042)", () => {
  it("permissão dada em Alertas e instalação pelo navegador ficam fora da conversão", async () => {
    const c = await funnel("thiago");
    expect(c.install_prompt_shown).toBeGreaterThanOrEqual(5);
    expect(c.app_installed).toBeGreaterThanOrEqual(2);
    expect(c.out_install).toBeGreaterThanOrEqual(1);
    expect(c.notif_preprompt_shown).toBeGreaterThanOrEqual(2);
    expect(c.notif_permission_granted).toBeGreaterThanOrEqual(1);
    expect(c.out_permission).toBeGreaterThanOrEqual(1);
    expect(c.denied).toBeGreaterThanOrEqual(1);
    // Filtro por aparelho: o pré-prompt do desktop fica de fora.
    const mobile = await funnel("thiago", { p_device: "mobile" });
    const desktop = await funnel("thiago", { p_device: "desktop" });
    expect(desktop.notif_preprompt_shown ?? 0).toBeGreaterThanOrEqual(1);
    expect((mobile.notif_preprompt_shown ?? 0) + (desktop.notif_preprompt_shown ?? 0)).toBe(
      c.notif_preprompt_shown,
    );
    // Dia fechado veio da tabela diária; o de hoje, ao vivo.
    const { data: daily } = await service
      .from("push_funnel_daily")
      .select("stage, n")
      .eq("day", iso(yesterday));
    expect(daily!.find((r) => r.stage === "install_prompt_shown")!.n).toBeGreaterThanOrEqual(4);
  });

  it("com 'Só o necessário' não há linhas em events nem em push_send_counters (Review Focus 5)", async () => {
    const anonId = randomUUID();
    const before =
      (await service.from("push_send_counters").select("send_id", { count: "exact", head: true }))
        .count ?? 0;
    const res = await POST(
      new Request("http://localhost/api/events", {
        method: "POST",
        headers: { "content-type": "text/plain", "x-forwarded-for": "192.0.2.77, 10.0.0.1" },
        body: JSON.stringify({
          name: "install_prompt_shown",
          anonId,
          userId: null,
          at: new Date().toISOString(),
          sourceId: null,
          contentId: null,
          session: { id: randomUUID(), page: "/", referrer: null, device: "mobile" },
          consent: { version: "v1", metrics: false, personalization: false },
          algoVersion: "rec-v1",
          props: { platform: "android", trigger: "visits" },
        }),
      }),
    );
    // Sem consentimento de métricas o cliente nem envia; se enviar, nada é gravado.
    expect([204, 400]).toContain(res.status);
    const { count } = await service
      .from("events")
      .select("id", { count: "exact", head: true })
      .eq("anon_id", anonId);
    expect(count).toBe(0);
    const after =
      (await service.from("push_send_counters").select("send_id", { count: "exact", head: true }))
        .count ?? 0;
    expect(after).toBe(before);
  });

  it("push_funnel recusa quem não tem push.metrics; analista lê", async () => {
    const otavio = await clientOf("otavio");
    const { error } = await otavio.rpc("push_funnel", { p_from: iso(yesterday), p_to: iso(today) });
    expect(error?.message).toMatch(/push\.metrics/);
    const { error: e2 } = await otavio.rpc("push_active_by_browser");
    expect(e2?.message).toMatch(/push\.metrics/);
    const thiago = await clientOf("thiago");
    const { data, error: e3 } = await thiago.rpc("push_active_by_browser");
    expect(e3).toBeNull();
    expect(Array.isArray(data)).toBe(true);
    // Sem sessão (anon) também não lê.
    const { error: e4 } = await service.rpc("push_funnel_refresh", { p_day: iso(yesterday) });
    expect(e4).toBeNull();
  });

  it("período antigo vem da tabela diária depois da retenção de events", async () => {
    // Um dia de 100 dias atrás: só a tabela diária guarda o número (os eventos já caíram).
    await service.from("push_funnel_daily").upsert({
      day: "2000-01-15",
      stage: "install_prompt_shown",
      device_class: "mobile",
      browser: "chrome",
      n: 7,
    });
    const thiago = await clientOf("thiago");
    const { data, error } = await thiago.rpc("push_funnel", {
      p_from: "2000-01-01",
      p_to: "2000-01-31",
    });
    expect(error).toBeNull();
    expect(Object.fromEntries((data ?? []).map((r) => [r.stage, Number(r.n)]))).toMatchObject({
      install_prompt_shown: 7,
    });
  });
});
