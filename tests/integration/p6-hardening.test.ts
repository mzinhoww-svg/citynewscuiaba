// @vitest-environment node
// Migration 0049 (P6, tarefa de segurança): máscara de IP em pipeline_events (achado 10 do gate
// do P5) e remoção de inscrição após falhas 400/413 seguidas (PWA-16).
import { randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it } from "vitest";
import { createServiceClient, type DbClient } from "@/lib/db/client";
import type { Database } from "@/lib/db/types";

const SEED_PASSWORD = "citynews-local-123";
const service = createServiceClient();
const run = randomBytes(3).toString("hex");
const IP = "203.0.113.45";
const IP6 = "2001:db8:aaaa:bbbb:cccc:dddd:eeee:ffff";

function anon(): DbClient {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
async function as(email: string): Promise<DbClient> {
  const c = anon();
  const r = await c.auth.signInWithPassword({ email, password: SEED_PASSWORD });
  if (r.error) throw r.error;
  return c;
}

const created = { subs: [] as string[], sends: [] as string[], articles: [] as string[] };
let eventId = 0;

afterAll(async () => {
  await service.from("push_sends").delete().in("id", created.sends);
  await service.from("push_subscriptions").delete().in("id", created.subs);
  await service.from("articles").delete().in("id", created.articles);
});

describe("pipeline_events: IP mascarado fora da administração (achado 10, P5)", () => {
  it("prepara um evento com IPv4 e IPv6 na mensagem e nos detalhes", async () => {
    const { data, error } = await service
      .from("pipeline_events")
      .insert({
        step: "fetch",
        item_ref: `source:p6-mask-${run}`,
        level: "warn",
        message: `bloqueio de ${IP} e ${IP6} em p6-mask-${run}`,
        details: { ip: IP, nested: { v6: IP6 } },
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    eventId = data!.id;
  });

  it("admin lê o valor original pela view", async () => {
    const { data, error } = await (
      await as("helena.costa@citynews.local")
    )
      .from("pipeline_events_view")
      .select("message, details")
      .eq("id", eventId)
      .single();
    expect(error).toBeNull();
    expect(data!.message).toContain(IP);
    expect(JSON.stringify(data!.details)).toContain(IP);
  });

  it.each([
    ["editor_chefe", "marina.arruda@citynews.local"],
    ["operador_ia", "diego.prado@citynews.local"],
    ["leitura", "paulo.rezende@citynews.local"],
  ])("%s lê a view com IP mascarado", async (_role, email) => {
    const { data, error } = await (
      await as(email)
    )
      .from("pipeline_events_view")
      .select("message, details")
      .eq("id", eventId)
      .single();
    expect(error).toBeNull();
    const all = JSON.stringify(data);
    expect(all).not.toContain(IP);
    expect(all).not.toContain("eeee:ffff");
    expect(data!.message).toContain("203.0.x.x");
  });

  it("a tabela crua só abre para admin; outros papéis, jornalista e anônimo não leem", async () => {
    const admin = await (
      await as("helena.costa@citynews.local")
    )
      .from("pipeline_events")
      .select("id")
      .eq("id", eventId);
    expect(admin.data).toHaveLength(1);
    for (const email of [
      "marina.arruda@citynews.local",
      "diego.prado@citynews.local",
      "juliana.campos@citynews.local",
    ]) {
      const r = await (await as(email)).from("pipeline_events").select("id").eq("id", eventId);
      expect(r.data ?? []).toHaveLength(0);
    }
    const a = await anon().from("pipeline_events").select("id").eq("id", eventId);
    expect(a.data ?? []).toHaveLength(0);
    const v = await anon().from("pipeline_events_view").select("id").eq("id", eventId);
    expect(v.data ?? []).toHaveLength(0);
  });

  it("jornalista (fora do Control Center) não lê a view", async () => {
    const r = await (
      await as("juliana.campos@citynews.local")
    )
      .from("pipeline_events_view")
      .select("id")
      .eq("id", eventId);
    expect(r.data ?? []).toHaveLength(0);
  });

  it("control_logs devolve o texto mascarado a quem não é admin e a busca não acha o IP", async () => {
    const marina = await as("marina.arruda@citynews.local");
    const { data, error } = await marina.rpc("control_logs", { p_item: `source:p6-mask-${run}` });
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(JSON.stringify(data)).not.toContain(IP);
    const byIp = await marina.rpc("control_logs", { p_q: IP, p_item: `source:p6-mask-${run}` });
    expect(byIp.data ?? []).toHaveLength(0);
    const helena = await (
      await as("helena.costa@citynews.local")
    ).rpc("control_logs", {
      p_q: IP,
      p_item: `source:p6-mask-${run}`,
    });
    expect(helena.data).toHaveLength(1);
    expect(JSON.stringify(helena.data)).toContain(IP);
  });
});

async function sub() {
  const { data, error } = await service
    .from("push_subscriptions")
    .insert({
      endpoint: `https://fcm.googleapis.com/fcm/send/p6-${randomBytes(6).toString("hex")}`,
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

/** Uma entrega por matéria (o índice único é por inscrição + matéria) e resultado informado. */
async function deliver(subId: string, http: number | null, outcome = "failed") {
  const artId = randomUUID();
  const art = await service.from("articles").insert({
    id: artId,
    slug: `p6-${run}-${artId.slice(0, 8)}`,
    kind: "original",
    section_slug: "cidade",
    title: `Matéria p6 ${artId.slice(0, 8)}`,
    dek: "Linha fina",
    body: { type: "doc", content: [] },
    status: "draft",
  });
  if (art.error) throw new Error(art.error.message);
  created.articles.push(artId);
  const s = await service
    .from("push_sends")
    .insert({
      kind: "highlight",
      article_id: artId,
      title: "Aviso",
      body: "Corpo",
      origin_label: "ORIGINAL CITYNEWS",
      url: "/materia/x",
      tag: randomBytes(8).toString("hex"),
      audience: { type: "all" },
      status: "dispatching",
      requested_by: "c1000000-0000-4000-8000-000000000002",
    })
    .select("id")
    .single();
  if (s.error) throw new Error(s.error.message);
  created.sends.push(s.data.id);
  const d = await service
    .from("push_deliveries")
    .insert({ send_id: s.data.id, subscription_id: subId, article_id: artId, status: "queued" })
    .select("id")
    .single();
  if (d.error) throw new Error(d.error.message);
  const r = await service.rpc("push_delivery_result", {
    p_delivery: d.data.id,
    p_outcome: outcome,
    ...(http !== null ? { p_http: http } : {}),
    p_error: http === null ? "x" : `http_${http}`,
  });
  if (r.error) throw new Error(r.error.message);
}
async function exists(id: string) {
  const { data } = await service.from("push_subscriptions").select("id").eq("id", id);
  return (data ?? []).length === 1;
}

describe("PWA-16 · inscrição removida após 3 falhas 400/413 seguidas", () => {
  it("duas falhas 400/413 mantêm; a terceira remove", async () => {
    const id = await sub();
    await deliver(id, 400);
    await deliver(id, 413);
    expect(await exists(id)).toBe(true);
    await deliver(id, 400);
    expect(await exists(id)).toBe(false);
  });

  it("um sucesso no meio zera a contagem", async () => {
    const id = await sub();
    await deliver(id, 400);
    await deliver(id, 400);
    await deliver(id, 201, "accepted");
    await deliver(id, 400);
    await deliver(id, 413);
    expect(await exists(id)).toBe(true);
    await deliver(id, 400);
    expect(await exists(id)).toBe(false);
  });

  it("outros 4xx (401) não entram na regra", async () => {
    const id = await sub();
    for (let i = 0; i < 4; i++) await deliver(id, 401);
    expect(await exists(id)).toBe(true);
  });
});
