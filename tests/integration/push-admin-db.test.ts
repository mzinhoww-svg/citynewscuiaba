// @vitest-environment node
// Migration 0041 (push, PW-T5): pedidos, regra de duas pessoas imposta no banco (Review Focus 6
// do plano; spec §18.20/21/23/24), pausa e retomada, configurações `push.*` e alcance.
// Cada cenário roda como `authenticated` com o JWT de uma pessoa do seed e tenta contornar a
// regra direto pela API; nada aqui depende da interface.
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServiceClient, type DbClient } from "@/lib/db/client";
import type { Database, Json } from "@/lib/db/types";

const SEED_PASSWORD = "citynews-local-123";
const HELENA = "c1000000-0000-4000-8000-000000000001"; // admin
const MARINA = "c1000000-0000-4000-8000-000000000002"; // editor_chefe
const ART_CIDADE = "c2000000-0000-4000-8000-000000000002"; // cidade, publicada
const ART_ESPORTES = "c2000000-0000-4000-8000-000000000010"; // esportes, publicada
const ART_MOBILIDADE = "c2000000-0000-4000-8000-000000000001";
const ART_CLIMA = "c2000000-0000-4000-8000-000000000007";
const ART_ECONOMIA = "c2000000-0000-4000-8000-000000000009";
const ART_SERVICOS = "c2000000-0000-4000-8000-000000000012";
const ART_CLIMA_2 = "c2000000-0000-4000-8000-000000000008";
const ART_MOB_2 = "c2000000-0000-4000-8000-000000000006";

const service = createServiceClient();
const testStart = new Date().toISOString();

const sessions = new Map<string, Promise<DbClient>>();
function as(email: string): Promise<DbClient> {
  const cached = sessions.get(email);
  if (cached) return cached;
  const client = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const ready = client.auth.signInWithPassword({ email, password: SEED_PASSWORD }).then((r) => {
    if (r.error) throw r.error;
    return client;
  });
  sessions.set(email, ready);
  return ready;
}
const helena = () => as("helena.costa@citynews.local");
const marina = () => as("marina.arruda@citynews.local");
const otavio = () => as("otavio.reis@citynews.local");
const thiago = () => as("thiago.moraes@citynews.local");
const diego = () => as("diego.prado@citynews.local");

type Rpc = keyof Database["public"]["Functions"];
async function rpcAs<F extends Rpc>(
  who: Promise<DbClient>,
  fn: F,
  args: Database["public"]["Functions"][F]["Args"],
) {
  const { data, error } = await (await who).rpc(fn, args as never);
  if (error) throw new Error(error.message);
  return data as Database["public"]["Functions"][F]["Returns"];
}

const urgentReq = (article: string, extra: Record<string, Json> = {}) => ({
  kind: "urgent",
  articleId: article,
  title: "Chuva forte",
  body: "Defesa Civil alerta",
  audience: { type: "all" },
  when: { type: "now" },
  justification: "Alerta da Defesa Civil",
  ...extra,
});
const highlightReq = (article: string, extra: Record<string, Json> = {}) => ({
  kind: "highlight",
  articleId: article,
  title: "Destaque",
  body: "Vale a leitura",
  audience: { type: "all" },
  when: { type: "now" },
  ...extra,
});

async function send(id: string) {
  const { data, error } = await service.from("push_sends").select("*").eq("id", id).single();
  if (error) throw new Error(error.message);
  return data;
}
async function setting(key: string) {
  const { data } = await service.from("app_settings").select("value").eq("key", key).single();
  return data!.value as Record<string, Json>;
}
async function auditActions(prefix: string): Promise<string[]> {
  const { data } = await service
    .from("audit_log")
    .select("action")
    .like("object_ref", `${prefix}%`)
    .gte("at", testStart);
  return (data ?? []).map((r) => r.action);
}

const subs: string[] = [];
async function insertSub(
  targets: string[],
  wants: Partial<{ want_urgent: boolean; want_highlight: boolean }> = {},
) {
  const { data, error } = await service
    .from("push_subscriptions")
    .insert({
      endpoint: `https://fcm.googleapis.com/fcm/send/adm-${randomBytes(6).toString("hex")}`,
      p256dh: randomBytes(65).toString("base64url"),
      auth: randomBytes(16).toString("base64url"),
      manage_token_hash: randomBytes(32).toString("base64url"),
      targets,
      ...wants,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  subs.push(data.id);
}

beforeAll(async () => {
  // Estado limpo das configurações (outras suítes podem ter pausado).
  await service.from("app_settings").upsert([
    { key: "push.paused", value: { on: false, by: null, at: null, reason: null } },
    { key: "push.default_daily_limit", value: 3 },
    { key: "push.quiet_start", value: 22 },
    { key: "push.quiet_end", value: 7 },
  ]);
});

afterAll(async () => {
  await service.from("push_sends").delete().gte("created_at", testStart);
  await service.from("approvals").delete().like("kind", "push.%").gte("created_at", testStart);
  if (subs.length) await service.from("push_subscriptions").delete().in("id", subs);
  await service.from("app_settings").upsert([
    { key: "push.paused", value: { on: false, by: null, at: null, reason: null } },
    { key: "push.default_daily_limit", value: 3 },
    { key: "push.quiet_start", value: 22 },
    { key: "push.quiet_end", value: 7 },
    { key: "sources.fast_lane_max", value: 10 },
  ]);
});

describe("duas pessoas (Review Focus 6)", () => {
  it("quem pede não aprova, nem por SQL; editor e analista não aprovam; Helena aprova", async () => {
    const id = await rpcAs(marina(), "push_request", { p: urgentReq(ART_CIDADE) });
    expect((await send(id)).status).toBe("pending_approval");
    expect((await send(id)).approval_id).not.toBeNull();
    await expect(rpcAs(marina(), "push_approve", { p_send: id })).rejects.toThrow(
      /outra pessoa|quem pede não decide/,
    );
    const sql = await (
      await marina()
    )
      .from("approvals")
      .update({ status: "approved", approved_by: MARINA })
      .eq("target_ref", `push:${id}`)
      .select("id");
    expect(sql.error?.message).toMatch(/quem pede não decide/);
    // Marina também não muda o estado do envio direto (sem aprovação registrada por outra pessoa).
    const direct = await (
      await marina()
    )
      .from("push_sends")
      .update({ status: "queued" })
      .eq("id", id)
      .select("id");
    expect(direct.error?.message).toMatch(/outra pessoa|push\.approve/);
    await expect(rpcAs(otavio(), "push_approve", { p_send: id })).rejects.toThrow();
    await expect(rpcAs(thiago(), "push_approve", { p_send: id })).rejects.toThrow();
    expect((await send(id)).status).toBe("pending_approval");
    expect(await rpcAs(helena(), "push_approve", { p_send: id })).toBe("queued");
    const row = await send(id);
    expect(row).toMatchObject({ status: "queued", approved_by: HELENA });
    expect(row.approved_at).not.toBeNull();
    await expect(rpcAs(helena(), "push_reject", { p_send: id, p_reason: "tarde" })).rejects.toThrow(
      /decisão já tomada/,
    );
    expect(await auditActions(`push:${id}`)).toEqual(
      expect.arrayContaining(["push.request", "push.approve"]),
    );
  });

  it("aprovação adulterada para rejected não vira queued; segunda decisão no mesmo pedido é final", async () => {
    const id = await rpcAs(marina(), "push_request", { p: urgentReq(ART_MOBILIDADE) });
    await rpcAs(helena(), "push_reject", { p_send: id, p_reason: "não é urgente" });
    expect(await send(id)).toMatchObject({ status: "rejected", status_reason: "não é urgente" });
    await expect(rpcAs(helena(), "push_approve", { p_send: id })).rejects.toThrow(
      /decisão já tomada/,
    );
    const again = await (
      await helena()
    )
      .from("approvals")
      .update({ status: "approved", approved_by: HELENA })
      .eq("target_ref", `push:${id}`)
      .select("id");
    expect(again.error?.message).toMatch(/decisão já tomada/);
  });
});

describe("pedidos", () => {
  it("editor pede Destaque só da própria editoria e não pede urgente", async () => {
    await expect(
      rpcAs(otavio(), "push_request", { p: highlightReq(ART_ESPORTES) }),
    ).rejects.toThrow(/editoria/);
    await expect(rpcAs(otavio(), "push_request", { p: urgentReq(ART_CIDADE) })).rejects.toThrow();
    const id = await rpcAs(otavio(), "push_request", { p: highlightReq(ART_CIDADE) });
    expect(id).toBeTruthy();
    // Otávio vê o próprio pedido; Thiago (analista) não vê nada.
    expect((await (await otavio()).from("push_sends").select("id").eq("id", id)).data).toHaveLength(
      1,
    );
    expect(
      (await (await thiago()).from("push_sends").select("id").eq("id", id)).data ?? [],
    ).toEqual([]);
    // Editor não aprova o próprio nem o de outra pessoa.
    await expect(rpcAs(otavio(), "push_approve", { p_send: id })).rejects.toThrow();
    expect(await rpcAs(marina(), "push_approve", { p_send: id })).toBe("queued");
  });

  it("matéria patrocinada ou não publicada recusada; urgente agendado recusado; Destaque fora do silêncio e até 7 dias", async () => {
    const { data: draft } = await service
      .from("articles")
      .select("id")
      .eq("status", "draft")
      .limit(1)
      .single();
    await expect(rpcAs(marina(), "push_request", { p: urgentReq(draft!.id) })).rejects.toThrow(
      /publicada/,
    );
    await service.from("articles").update({ sponsored: true }).eq("id", ART_ECONOMIA);
    try {
      await expect(rpcAs(marina(), "push_request", { p: urgentReq(ART_ECONOMIA) })).rejects.toThrow(
        /atrocinada/,
      );
    } finally {
      await service.from("articles").update({ sponsored: false }).eq("id", ART_ECONOMIA);
    }
    const tomorrow = new Date(Date.now() + 86_400_000);
    tomorrow.setUTCHours(15, 0, 0, 0); // 11:00 de Cuiabá
    await expect(
      rpcAs(marina(), "push_request", {
        p: urgentReq(ART_CIDADE, { when: { type: "at", at: tomorrow.toISOString() } }),
      }),
    ).rejects.toThrow(/agora/);
    const night = new Date(tomorrow);
    night.setUTCHours(3, 0, 0, 0); // 23:00 de Cuiabá
    await expect(
      rpcAs(marina(), "push_request", {
        p: highlightReq(ART_CLIMA, { when: { type: "at", at: night.toISOString() } }),
      }),
    ).rejects.toThrow(/silêncio/);
    const far = new Date(Date.now() + 9 * 86_400_000);
    far.setUTCHours(15, 0, 0, 0);
    await expect(
      rpcAs(marina(), "push_request", {
        p: highlightReq(ART_CLIMA, { when: { type: "at", at: far.toISOString() } }),
      }),
    ).rejects.toThrow(/7 dias/);
    const id = await rpcAs(marina(), "push_request", {
      p: highlightReq(ART_CLIMA, { when: { type: "at", at: tomorrow.toISOString() } }),
    });
    expect(await rpcAs(helena(), "push_approve", { p_send: id })).toBe("scheduled");
  });

  it("texto e público imutáveis depois do pedido; cancelar por quem pediu ou push.settings", async () => {
    const id = await rpcAs(marina(), "push_request", { p: urgentReq(ART_SERVICOS) });
    const t = await service.from("push_sends").update({ title: "outro" }).eq("id", id).select("id");
    expect(t.error?.message).toMatch(/imutáve/);
    const a = await service
      .from("push_sends")
      .update({ audience: { type: "section", slug: "cidade" } })
      .eq("id", id)
      .select("id");
    expect(a.error?.message).toMatch(/imutáve/);
    await expect(
      rpcAs(otavio(), "push_cancel", { p_send: id, p_reason: "não é meu" }),
    ).rejects.toThrow();
    await rpcAs(marina(), "push_cancel", { p_send: id, p_reason: "mudou" });
    expect(await send(id)).toMatchObject({ status: "cancelled", status_reason: "mudou" });
    expect(await auditActions(`push:${id}`)).toContain("push.cancel");
  });

  it("expiração: urgente sem aprovação em 60 min; Destaque 'agora' em 24 h", async () => {
    const u = await rpcAs(marina(), "push_request", { p: urgentReq(ART_CLIMA_2) });
    const h = await rpcAs(marina(), "push_request", { p: highlightReq(ART_MOB_2) });
    const later = new Date(Date.now() + 61 * 60_000).toISOString();
    expect(
      await service.rpc("push_expire_requests", { p_now: later }).then((r) => r.data),
    ).toBeGreaterThanOrEqual(1);
    expect((await send(u)).status).toBe("expired");
    expect((await send(h)).status).toBe("pending_approval");
    await service.rpc("push_expire_requests", {
      p_now: new Date(Date.now() + 25 * 3_600_000).toISOString(),
    });
    expect((await send(h)).status).toBe("expired");
    await expect(rpcAs(helena(), "push_approve", { p_send: u })).rejects.toThrow(
      /expired|decisão já tomada/,
    );
  });
});

describe("pausa, retomada e configurações", () => {
  it("pausar vale na hora; retomar exige outra pessoa com push.approve", async () => {
    const id = await rpcAs(marina(), "push_request", { p: urgentReq(ART_CIDADE) });
    await rpcAs(helena(), "push_approve", { p_send: id });
    await expect(rpcAs(thiago(), "push_settings_pause", { p_reason: "x" })).rejects.toThrow();
    await rpcAs(helena(), "push_settings_pause", { p_reason: "incidente" });
    expect((await setting("push.paused")).on).toBe(true);
    expect((await send(id)).status).toBe("paused");
    await expect(
      rpcAs(helena(), "app_setting_set", {
        p_key: "push.paused",
        p_value: { on: false },
        p_ctx: {},
      }),
    ).rejects.toThrow(/pausar\/retomar/);
    const a = await rpcAs(helena(), "push_resume_request", { p_reason: "resolvido" });
    await expect(rpcAs(helena(), "push_resume_approve", { p_approval: a })).rejects.toThrow(
      /outra pessoa|quem pede não decide/,
    );
    await expect(rpcAs(otavio(), "push_resume_approve", { p_approval: a })).rejects.toThrow();
    expect((await setting("push.paused")).on).toBe(true);
    await rpcAs(marina(), "push_resume_approve", { p_approval: a });
    expect((await setting("push.paused")).on).toBe(false);
    expect((await send(id)).status).toBe("queued");
    const { data: appr } = await service.from("approvals").select("status").eq("id", a).single();
    expect(appr!.status).toBe("applied");
    expect(await auditActions("push:")).toEqual(
      expect.arrayContaining(["push.pause", "push.resume_requested", "push.resume_applied"]),
    );
  });

  it("configurações: limite 1–3, silêncio contém 22h–7h, operador de IA não mexe em push", async () => {
    await expect(
      rpcAs(helena(), "app_setting_set", { p_key: "push.quiet_start", p_value: 23, p_ctx: {} }),
    ).rejects.toThrow();
    await expect(
      rpcAs(helena(), "app_setting_set", { p_key: "push.quiet_end", p_value: 6, p_ctx: {} }),
    ).rejects.toThrow();
    await expect(
      rpcAs(helena(), "app_setting_set", {
        p_key: "push.default_daily_limit",
        p_value: 4,
        p_ctx: {},
      }),
    ).rejects.toThrow();
    await expect(
      rpcAs(diego(), "app_setting_set", {
        p_key: "push.default_daily_limit",
        p_value: 2,
        p_ctx: {},
      }),
    ).rejects.toThrow(/push\.settings/);
    await expect(
      rpcAs(diego(), "app_setting_set", { p_key: "sources.fast_lane_max", p_value: 5, p_ctx: {} }),
    ).resolves.not.toThrow();
    await expect(
      rpcAs(thiago(), "app_setting_set", { p_key: "sources.fast_lane_max", p_value: 5, p_ctx: {} }),
    ).rejects.toThrow(/source\.manage/);
    await rpcAs(helena(), "app_setting_set", {
      p_key: "push.default_daily_limit",
      p_value: 2,
      p_ctx: { reason: "teste" },
    });
    expect(await setting("push.default_daily_limit")).toBe(2);
    await expect(
      rpcAs(helena(), "app_setting_set", {
        p_key: "push.templates",
        p_value: [{ name: "x", title: "{titulo}", body: "{outro}" }],
        p_ctx: {},
      }),
    ).rejects.toThrow(/titulo/);
    await rpcAs(helena(), "app_setting_set", {
      p_key: "push.templates",
      p_value: [{ name: "Padrão", title: "{titulo}", body: "{linha_fina}" }],
      p_ctx: {},
    });
    // Editor lê as configurações de push; leitura não.
    expect(
      (await (await otavio()).from("app_settings").select("key").like("key", "push.%")).data!
        .length,
    ).toBeGreaterThanOrEqual(4);
  });

  it("alcance arredondado e 'menos de 20'", async () => {
    for (let i = 0; i < 23; i++)
      await insertSub(["section:cidade"], { want_highlight: i % 2 === 0 });
    expect(
      await rpcAs(marina(), "push_audience_estimate", {
        p_kind: "urgent",
        p_audience: { type: "section", slug: "cidade" },
      }),
    ).toBe(20);
    expect(
      await rpcAs(marina(), "push_audience_estimate", {
        p_kind: "highlight",
        p_audience: { type: "section", slug: "cidade" },
      }),
    ).toBe(0);
    expect(
      await rpcAs(otavio(), "push_audience_estimate", {
        p_kind: "highlight",
        p_audience: { type: "bairro", slug: "cpa" },
      }),
    ).toBe(0);
    await expect(
      rpcAs(thiago(), "push_audience_estimate", { p_kind: "urgent", p_audience: { type: "all" } }),
    ).rejects.toThrow();
  });
});
