// @vitest-environment node
// Migration 0047 (gate do PWA, docs/reports/pwa-gate-review.md): PWA-01, 03, 04, 08, 09 e 16.
import { randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServiceClient, type DbClient } from "@/lib/db/client";
import type { Database, Json } from "@/lib/db/types";

const MARINA = "c1000000-0000-4000-8000-000000000002"; // editor_chefe
const SEED_PASSWORD = "citynews-local-123";
const service = createServiceClient();
const run = randomBytes(3).toString("hex");
const created = { articles: [] as string[], subs: [] as string[], sends: [] as string[] };

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
const helena = () => as("helena.costa@citynews.local"); // admin
const marina = () => as("marina.arruda@citynews.local"); // editor_chefe

async function rpc<F extends keyof Database["public"]["Functions"]>(
  who: Promise<DbClient>,
  fn: F,
  args: Database["public"]["Functions"][F]["Args"],
) {
  const { data, error } = await (await who).rpc(fn, args as never);
  if (error) throw new Error(error.message);
  return data as Database["public"]["Functions"][F]["Returns"];
}

async function setArticle(id: string, patch: Record<string, unknown>) {
  const { error } = await service.from("articles").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
}
async function article(status: string, extra: Record<string, unknown> = {}) {
  const id = randomUUID();
  const { error } = await service.from("articles").insert({
    id,
    slug: `gate-fix-${run}-${id.slice(0, 8)}`,
    kind: "original",
    section_slug: "cidade",
    title: `Matéria de teste ${id.slice(0, 8)}`,
    dek: "Linha fina de teste",
    body: { type: "doc", content: [] },
    status: "draft",
    ...extra,
  });
  if (error) throw new Error(error.message);
  created.articles.push(id);
  if (status !== "draft") await setArticle(id, { status, published_at: new Date().toISOString() });
  return id;
}
async function send(id: string) {
  const { data, error } = await service.from("push_sends").select("*").eq("id", id).single();
  if (error) throw new Error(error.message);
  return data;
}
async function serviceSend(articleId: string, kind: string, status: string, extra = {}) {
  const { data, error } = await service
    .from("push_sends")
    .insert({
      kind,
      article_id: articleId,
      title: "Aviso de teste",
      body: "Corpo de teste",
      origin_label: "ORIGINAL CITYNEWS",
      url: "/materia/x",
      tag: randomBytes(8).toString("hex"),
      audience: { type: "all" },
      status,
      ...(kind === "follow" ? {} : { requested_by: MARINA }),
      ...extra,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  created.sends.push(data.id);
  return data.id;
}
async function subscription() {
  const { data, error } = await service
    .from("push_subscriptions")
    .insert({
      endpoint: `https://fcm.googleapis.com/fcm/send/gf-${randomBytes(6).toString("hex")}`,
      p256dh: randomBytes(65).toString("base64url"),
      auth: randomBytes(16).toString("base64url"),
      manage_token_hash: randomBytes(32).toString("base64url"),
      targets: ["section:cidade"],
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  created.subs.push(data.id);
  return data.id;
}
async function delivery(sendId: string, subId: string, articleId: string, extra = {}) {
  const { data, error } = await service
    .from("push_deliveries")
    .insert({
      send_id: sendId,
      subscription_id: subId,
      article_id: articleId,
      status: "queued",
      ...extra,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id;
}
async function deliveryStatus(id: number) {
  const { data } = await service.from("push_deliveries").select("status").eq("id", id).single();
  return data!.status;
}

const req = (kind: string, articleId: string, extra: Record<string, Json> = {}) => ({
  kind,
  articleId,
  title: "Aviso de teste",
  body: "Corpo de teste",
  audience: { type: "all" },
  when: { type: "now" },
  ...(kind === "urgent" ? { justification: "Alerta de teste" } : {}),
  ...extra,
});

const resetPause = () =>
  service
    .from("app_settings")
    .upsert({ key: "push.paused", value: { on: false }, updated_at: new Date().toISOString() });

beforeAll(async () => {
  await resetPause();
});
afterAll(async () => {
  await resetPause();
  await service.from("push_sends").delete().in("id", created.sends);
  await service.from("push_subscriptions").delete().in("id", created.subs);
  await service.from("articles").delete().in("id", created.articles);
  await service.from("app_settings").delete().eq("key", "zz.probe");
});

describe("PWA-01 · despublicar cancela o que ainda não saiu", () => {
  it("envio em dispatching é cancelado e as entregas pendentes expiram; o já enviado fica", async () => {
    const art = await article("published");
    const s = await serviceSend(art, "highlight", "dispatching", {
      started_at: new Date().toISOString(),
    });
    const dq = await delivery(s, await subscription(), art, {
      attempts: 1,
      not_before: new Date().toISOString(),
    });
    const dd = await delivery(s, await subscription(), art, {
      status: "deferred",
      not_before: new Date().toISOString(),
    });
    const dok = await delivery(s, await subscription(), art, {
      status: "sent",
      sent_at: new Date().toISOString(),
    });
    await setArticle(art, { status: "unpublished" });
    expect(await send(s)).toMatchObject({
      status: "cancelled",
      status_reason: "Matéria despublicada",
    });
    expect(await deliveryStatus(dq)).toBe("expired");
    expect(await deliveryStatus(dd)).toBe("expired");
    expect(await deliveryStatus(dok)).toBe("sent");
  });

  it("envio já sent com retry pendente: a entrega expira", async () => {
    const art = await article("published");
    const s = await serviceSend(art, "follow", "sent", { started_at: new Date().toISOString() });
    const dq = await delivery(s, await subscription(), art, {
      attempts: 2,
      not_before: new Date().toISOString(),
    });
    await setArticle(art, { status: "unpublished" });
    expect((await send(s)).status).toBe("sent");
    expect(await deliveryStatus(dq)).toBe("expired");
  });
});

describe("PWA-04 · matéria updated conta como no ar", () => {
  it("pedido de Destaque de matéria corrigida é aceito", async () => {
    const art = await article("updated");
    const id = await rpc(marina(), "push_request", { p: req("highlight", art) });
    created.sends.push(id);
    expect((await send(id)).status).toBe("pending_approval");
  });
});

describe("PWA-16 · patrocínio reconferido no despacho", () => {
  it("aprovado e depois patrocinado: push_dispatch_due cancela e não despacha", async () => {
    const art = await article("published");
    const id = await rpc(marina(), "push_request", { p: req("urgent", art) });
    created.sends.push(id);
    await rpc(helena(), "push_approve", { p_send: id });
    await setArticle(art, { sponsored: true });
    const r = await service.rpc("push_dispatch_due", { p_now: new Date().toISOString() });
    expect(r.error).toBeNull();
    expect(await send(id)).toMatchObject({
      status: "cancelled",
      status_reason: "Matéria patrocinada",
    });
  });

  it("push_settings_int só lê chaves push.%", async () => {
    await service
      .from("app_settings")
      .upsert({ key: "zz.probe", value: 7, updated_at: new Date().toISOString() });
    expect(await rpc(helena(), "push_settings_int", { p_key: "zz.probe", p_default: 99 })).toBe(99);
  });
});

describe("PWA-09 · quem pediu não forja o aprovador", () => {
  it("update de approved_by na própria linha pendente é recusado", async () => {
    const art = await article("published");
    const id = await rpc(marina(), "push_request", { p: req("highlight", art) });
    created.sends.push(id);
    const { data: h } = await service
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin")
      .limit(1);
    const m = await marina();
    const r = await m
      .from("push_sends")
      .update({ approved_by: h![0]!.user_id })
      .eq("id", id)
      .select("id");
    expect(r.error?.message ?? "").toMatch(/só muda pelo serviço/);
    expect((await send(id)).approved_by).toBeNull();
  });
});

describe("PWA-08 · entrega reservada e nunca enviada é reprocessada", () => {
  it("push_dispatch_due enfileira push_due para queued sem tentativa e antiga", async () => {
    const art = await article("published");
    const s = await serviceSend(art, "follow", "sent", { started_at: new Date().toISOString() });
    await delivery(s, await subscription(), art, {
      created_at: new Date(Date.now() - 10 * 60_000).toISOString(),
    });
    const r = await service.rpc("push_dispatch_due", { p_now: new Date().toISOString() });
    expect(r.error).toBeNull();
    const { data } = await service
      .from("jobs")
      .select("dedupe_key")
      .eq("queue", "notify")
      .eq("dedupe_key", `push_due:due:${s}`);
    expect(data).toHaveLength(1);
  });
});

describe("PWA-03 · retomar não reativa o que não devia", () => {
  it("agendado futuro volta a scheduled; urgente e follow velhos expiram", async () => {
    const art = await article("published");
    const at = new Date(Date.now() + 26 * 3_600_000);
    at.setUTCHours(16, 0, 0, 0); // 12h de Cuiabá, fora do silêncio
    const scheduled = await rpc(marina(), "push_request", {
      p: req("highlight", art, { when: { type: "at", at: at.toISOString() } }),
    });
    created.sends.push(scheduled);
    await rpc(helena(), "push_approve", { p_send: scheduled });
    expect((await send(scheduled)).status).toBe("scheduled");

    const old = await serviceSend(art, "urgent", "dispatching", {
      started_at: new Date(Date.now() - 3 * 3_600_000).toISOString(),
    });
    const oldFollow = await serviceSend(await article("published"), "follow", "dispatching", {
      started_at: new Date(Date.now() - 7 * 3_600_000).toISOString(),
    });
    const fresh = await serviceSend(await article("published"), "follow", "dispatching", {
      started_at: new Date().toISOString(),
    });

    await rpc(helena(), "push_settings_pause", { p_reason: "teste PWA-03" });
    expect((await send(scheduled)).status).toBe("paused");
    const a = await rpc(helena(), "push_resume_request", { p_reason: "teste PWA-03" });
    await rpc(marina(), "push_resume_approve", { p_approval: a });

    expect((await send(scheduled)).status).toBe("scheduled");
    expect(await send(old)).toMatchObject({ status: "expired" });
    expect(await send(oldFollow)).toMatchObject({ status: "expired" });
    expect((await send(fresh)).status).toBe("queued");

    // O despacho não solta o agendado antes da hora.
    await service.rpc("push_dispatch_due", { p_now: new Date().toISOString() });
    expect((await send(scheduled)).status).toBe("scheduled");
  });
});
