// @vitest-environment node
// Envio de ponta a ponta (PW-T9; spec 2026-09-28 §12; critérios 12, 13, 14; Review Focus 3 e 6
// do plano): trigger de publicação → fila `notify` → push_match/push_deliver/push_due com
// web-push real contra o servidor de push falso. Par VAPID gerado em tempo de execução.
import { randomBytes, randomUUID } from "node:crypto";
import webpush from "web-push";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createServiceClient } from "@/lib/db/client";
import type { Json } from "@/lib/db/types";
import { createPushSendStore } from "@/lib/db/push-send-store";
import { drain } from "@/lib/pipeline/drain";
import type { PipelineEvent } from "@/lib/pipeline/ports";
import { createQueue } from "@/lib/pipeline/queue";
import { createRunStep } from "@/lib/pipeline/run-step";
import { fakeResolve } from "@/lib/pipeline/testing/fake-http";
import { createWebPushSender } from "@/lib/push/sender";
import { createPushSteps } from "@/lib/push/steps";
import { browserKeys, startFakePushServer, type FakePushServer } from "../support/fake-push-server";

// Fan-out de 1 200 inscrições com web-push real e vários drains: bem acima dos 5 s padrão.
vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

const db = createServiceClient();
const run = randomBytes(3).toString("hex");
let server: FakePushServer;
let sender: ReturnType<typeof createWebPushSender>;
const keys = browserKeys();
const created = { articles: [] as string[], subs: [] as string[] };
const testStart = new Date().toISOString();

/** Relógio fixo às 11:00 de Cuiabá de hoje (fora do silêncio); a noite e a manhã derivam dele. */
const DAY = new Date();
DAY.setUTCHours(15, 0, 0, 0);
const at = (h: number) => new Date(DAY.getTime() + h * 3_600_000);
const NIGHT = at(11.5); // 22:30 de Cuiabá
const EARLY = at(18.5); // 05:30 de Cuiabá (dia seguinte)
const MORNING = at(20); // 07:00 de Cuiabá
/** Bairro único desta execução: só as inscrições desta suíte casam com as matérias dela. */
const HOOD = `pf${run}`;
const received = (suffix: string) =>
  server.received.filter((r) => r.path === `/${run}/${suffix}`).length;

const sink = { record: async (e: PipelineEvent[]) => void e };
const queue = createQueue(db);
const store = createPushSendStore(db);

function stepsAt(now: () => Date) {
  return createRunStep(createPushSteps({ store, sender, now }));
}
async function drainOnce(now: () => Date = () => DAY) {
  return drain({
    queue,
    runStep: stepsAt(now),
    events: sink,
    now: () => Date.now(),
    queues: ["notify"],
    beforeDrain: async () => {
      const { error } = await db.rpc("push_dispatch_due", { p_now: now().toISOString() });
      if (error) throw new Error(error.message);
    },
  });
}

async function insertSub(targets: string[], suffix: string, extra: Record<string, unknown> = {}) {
  const { data, error } = await db
    .from("push_subscriptions")
    .insert({
      endpoint: `${server.origin}/${run}/${suffix}`,
      p256dh: keys.p256dh,
      auth: keys.authB64,
      manage_token_hash: randomBytes(32).toString("hex"),
      targets,
      ...extra,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  created.subs.push(data.id);
  return data.id;
}

async function draft(section = "cidade", extra: Record<string, unknown> = {}) {
  const id = randomUUID();
  const { error } = await db.from("articles").insert({
    id,
    slug: `push-flow-${run}-${id.slice(0, 8)}`,
    kind: "original",
    section_slug: section,
    title: `Matéria de teste ${id.slice(0, 8)}`,
    dek: "Linha fina de teste",
    body: { type: "doc", content: [] },
    status: "draft",
    neighborhoods: [HOOD],
    ...extra,
  });
  if (error) throw new Error(error.message);
  created.articles.push(id);
  return id;
}

async function publishAs(mode: "human" | "auto", id: string) {
  const { error } = await db
    .from("articles")
    .update({ status: "published", publish_mode: mode, published_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

async function unpublish(id: string) {
  const { error } = await db.from("articles").update({ status: "unpublished" }).eq("id", id);
  if (error) throw new Error(error.message);
}

/** Antecipa a visibilidade de um job (a janela de arrependimento de 10 min). */
async function advanceQueue(key: string) {
  const { error } = await db
    .from("jobs")
    .update({ visible_at: new Date(Date.now() - 1000).toISOString() })
    .eq("queue", "notify")
    .eq("dedupe_key", key);
  if (error) throw new Error(error.message);
}

async function send(id: string) {
  const { data, error } = await db.from("push_sends").select("*").eq("id", id).single();
  if (error) throw new Error(error.message);
  return data;
}

async function followSendOf(article: string) {
  const { data } = await db
    .from("push_sends")
    .select("*")
    .eq("kind", "follow")
    .eq("article_id", article)
    .maybeSingle();
  return data;
}

async function requestUrgent(article: string, extra: Record<string, unknown> = {}) {
  const { createClient } = await import("@supabase/supabase-js");
  const asUser = async (email: string) => {
    const c = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const r = await c.auth.signInWithPassword({ email, password: "citynews-local-123" });
    if (r.error) throw r.error;
    return c;
  };
  const marina = await asUser("marina.arruda@citynews.local");
  const req = await marina.rpc("push_request", {
    p: {
      kind: "urgent",
      articleId: article,
      title: "Urgente de teste",
      body: "Corpo urgente",
      audience: { type: "all" },
      when: { type: "now" },
      justification: "teste",
      ...extra,
    },
  });
  if (req.error) throw new Error(req.error.message);
  // A política de avisos aprova na mesma chamada (A-127): já está na fila.
  return req.data as string;
}

let policyBody: Json | null = null;

beforeAll(async () => {
  server = await startFakePushServer();
  const pair = webpush.generateVAPIDKeys();
  sender = createWebPushSender(
    {
      publicKey: pair.publicKey,
      privateKey: pair.privateKey,
      subject: "mailto:teste@citynews.local",
    },
    { resolve: fakeResolve({}), testHosts: [server.host], timeoutMs: 5000 },
  );
  // Fila e inscrições limpas: jobs de push deixados por outras suítes (publicações do Estúdio) e
  // inscrições de teste (endpoints em 127.0.0.1) de execuções interrompidas não entram aqui.
  await db.from("jobs").delete().eq("queue", "notify").like("dedupe_key", "push_%");
  await db.from("push_subscriptions").delete().like("endpoint", "http://127.0.0.1:%");
  // Matérias desta suíte deixadas por uma execução interrompida (as contagens do seed dependem).
  await db.from("articles").delete().like("slug", "push-flow-%");
  await db.from("app_settings").upsert([
    { key: "push.paused", value: { on: false, by: null, at: null, reason: null } },
    { key: "push.default_daily_limit", value: 3 },
  ]);
  const { data: pol } = await db
    .from("governance_policies")
    .select("body")
    .eq("active", true)
    .single();
  policyBody = pol!.body;
  await db
    .from("governance_policies")
    .update({
      body: {
        ...(pol!.body as Record<string, Json>),
        push: { urgentMaxPerHour: 100, highlightMaxPerDay: 100 },
      },
    })
    .eq("active", true);
});

afterAll(async () => {
  if (policyBody !== null)
    await db.from("governance_policies").update({ body: policyBody }).eq("active", true);
  await db.from("jobs").delete().eq("queue", "notify").like("dedupe_key", "push_%");
  await db.from("push_sends").delete().gte("created_at", testStart);
  await db.from("approvals").delete().like("kind", "push.%").gte("created_at", testStart);
  await db.from("push_subscriptions").delete().like("endpoint", "http://127.0.0.1:%");
  if (created.articles.length) await db.from("articles").delete().in("id", created.articles);
  await db.from("notifications").delete().eq("dedupe_key", "push-vapid-invalid");
  await server.close();
});

describe("follow (critério 12)", () => {
  it("publicada por pessoa sai na hora; automática espera 10 min e despublicada no meio não envia", async () => {
    await insertSub([`bairro:${HOOD}`], "cpa");
    await insertSub(["section:esportes"], "esportes");
    const human = await draft();
    await publishAs("human", human);
    await drainOnce();
    expect(received("cpa")).toBe(1);
    expect(received("esportes")).toBe(0);
    const s = (await followSendOf(human))!;
    expect(s).toMatchObject({
      status: "sent",
      targets_n: 1,
      queued_n: 1,
      accepted_n: 1,
      batches_total: 1,
      batches_done: 1,
    });
    expect(s.body).toBe("Linha fina de teste");
    const plain = (await server.decrypt(server.received.at(-1)!.body, {
      privateKey: keys.privateKey,
      auth: keys.auth,
    })) as Record<string, string>;
    expect(plain.b).toBe("ORIGINAL CITYNEWS · Linha fina de teste");
    expect(plain.u).toMatch(/^\/materia\/push-flow-/);

    const auto = await draft();
    await publishAs("auto", auto);
    await drainOnce();
    expect(received("cpa")).toBe(1);
    await unpublish(auto);
    await advanceQueue(`push_match:article:${auto}`);
    await drainOnce();
    expect(received("cpa")).toBe(1);
    expect(await followSendOf(auto)).toBeNull();
    // Publicar de novo a mesma matéria não gera segundo follow (índice único; ack do job).
    await unpublish(human);
    await publishAs("human", human);
    await drainOnce();
    expect(received("cpa")).toBe(1);
  });

  it("fan-out de 1 200 inscrições em 3 páginas e 12 lotes, contadores fechados", async () => {
    const rows = Array.from({ length: 1200 }, (_, i) => ({
      endpoint: `${server.origin}/${run}/fan/${i}`,
      p256dh: keys.p256dh,
      auth: keys.authB64,
      manage_token_hash: randomBytes(32).toString("hex"),
      targets: [`bairro:fan${run}`],
    }));
    for (let i = 0; i < rows.length; i += 400) {
      const { data, error } = await db
        .from("push_subscriptions")
        .insert(rows.slice(i, i + 400))
        .select("id");
      if (error) throw new Error(error.message);
      created.subs.push(...data.map((r) => r.id));
    }
    const art = await draft("servicos", { neighborhoods: [`fan${run}`] });
    await publishAs("human", art);
    const first = await drainOnce();
    expect(first.processed).toBeGreaterThanOrEqual(1);
    // Até 80% do orçamento: repete o drain até a fila esvaziar.
    for (let i = 0; i < 10 && (await queue.pending("notify")) > 0; i++) await drainOnce();
    expect(server.received.filter((r) => r.path.startsWith(`/${run}/fan/`)).length).toBe(1200);
    const s = (await followSendOf(art))!;
    expect(s).toMatchObject({
      status: "sent",
      targets_n: 1200,
      queued_n: 1200,
      accepted_n: 1200,
      batches_total: 12,
      batches_done: 12,
    });
    const { count } = await db
      .from("push_batches")
      .select("*", { count: "exact", head: true })
      .eq("send_id", s.id)
      .eq("status", "done");
    expect(count).toBe(12);
  }, 120_000);
});

describe("urgente e Destaque (critérios 13, 14, 20; Review Focus 6)", () => {
  it("urgente aprovado por Helena sai no silêncio; Destaque no silêncio fica deferred e sai às 07:00", async () => {
    const subId = await insertSub([`bairro:${HOOD}`], "night", { want_follow: false });
    const art = await draft();
    await publishAs("human", art);
    await drainOnce(); // follow: pulado por preferência (want_follow = false)
    const urgent = await requestUrgent(art);
    await drainOnce(() => NIGHT);
    expect(received("night")).toBe(1);
    expect(server.received.at(-1)!.headers).toMatchObject({ urgency: "high", ttl: "7200" });
    // A inscrição "cpa" do primeiro teste também segue o bairro: 2 entregas aceitas.
    expect(await send(urgent)).toMatchObject({ status: "sent" });
    expect((await send(urgent)).accepted_n).toBeGreaterThanOrEqual(1);
    const { data: appr } = await db
      .from("approvals")
      .select("status")
      .eq("target_ref", `push:${urgent}`)
      .single();
    expect(appr!.status).toBe("applied");

    // Destaque pedido por Marina e aprovado por Helena, às 05:30 de Cuiabá: adia até 07:00.
    const art2 = await draft("cidade");
    await publishAs("human", art2);
    await drainOnce();
    const { createClient } = await import("@supabase/supabase-js");
    const marina = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    await marina.auth.signInWithPassword({
      email: "marina.arruda@citynews.local",
      password: "citynews-local-123",
    });
    const req = await marina.rpc("push_request", {
      p: {
        kind: "highlight",
        articleId: art2,
        title: "Destaque",
        body: "Vale ler",
        audience: { type: "bairro", slug: HOOD },
        when: { type: "now" },
      },
    });
    if (req.error) throw new Error(req.error.message);
    const highlight = req.data as string;
    await drainOnce(() => EARLY);
    expect(received("night")).toBe(1);
    const { data: d } = await db
      .from("push_deliveries")
      .select("status, not_before")
      .eq("send_id", highlight)
      .eq("subscription_id", subId)
      .single();
    expect(d).toMatchObject({ status: "deferred" });
    expect(new Date(d!.not_before!).toISOString()).toBe(MORNING.toISOString());
    expect((await send(highlight)).status).toBe("sent"); // lotes fechados; a entrega adiada segue por push_due
    await drainOnce(() => MORNING);
    expect(received("night")).toBe(2);
    expect(server.received.at(-1)!.headers).toMatchObject({ urgency: "normal", ttl: "43200" });
    expect((await send(highlight)).accepted_n).toBeGreaterThanOrEqual(1);
  });

  it("despacho reconfere a aprovação: registro adulterado para rejected → cancelado sem enviar", async () => {
    await insertSub(["section:cidade"], "tamper");
    const art = await draft();
    await publishAs("human", art);
    await drainOnce();
    const before = server.received.length;
    const id = await requestUrgent(art);
    await db.from("approvals").update({ status: "rejected" }).eq("target_ref", `push:${id}`);
    await db.rpc("push_dispatch_due", { p_now: new Date().toISOString() });
    expect(await send(id)).toMatchObject({
      status: "cancelled",
      status_reason: "Aprovação inválida",
    });
    await drainOnce();
    expect(server.received.length - before).toBe(0);
  });

  it("404/410 no envio apaga a inscrição e soma removed_n (critério 14); urgente pendente há 61 min expira", async () => {
    const gone = await insertSub([`bairro:${HOOD}`], "gone410");
    server.respond(`/${run}/gone410`, 410);
    const art = await draft();
    await publishAs("human", art);
    await drainOnce();
    expect((await db.from("push_subscriptions").select("id").eq("id", gone)).data).toEqual([]);
    expect((await followSendOf(art))!.removed_n).toBe(1);

    // Pedido pendente (de antes da política de avisos, A-127) não fica parado: vence em 60 min.
    const pend = await db
      .from("push_sends")
      .insert({
        kind: "urgent",
        article_id: art,
        title: "Pendente",
        body: "Sem aprovação",
        origin_label: "ORIGINAL CITYNEWS",
        url: "/materia/pendente",
        tag: "pendente",
        audience: { type: "all" },
        status: "pending_approval",
        requested_by: "c1000000-0000-4000-8000-000000000002", // Marina (seed)
        justification: "teste",
      })
      .select("id")
      .single();
    if (pend.error) throw new Error(pend.error.message);
    const later = new Date(Math.max(Date.now(), DAY.getTime()) + 61 * 60_000);
    const r = await db.rpc("push_dispatch_due", { p_now: later.toISOString() });
    expect(r.error).toBeNull();
    expect((await send(pend.data.id)).status).toBe("expired");
  });

  it("403 em massa (5+ inscrições, metade do lote) pausa o envio e abre o alerta (G8, PWA-02)", async () => {
    await db.from("notifications").delete().eq("dedupe_key", "push-vapid-invalid");
    const hood = `${HOOD}v`;
    const bad = ["k1", "k2", "k3", "k4", "k5"];
    for (const k of bad) {
      await insertSub([`bairro:${hood}`], k);
      server.respond(`/${run}/${k}`, 403);
    }
    await insertSub([`bairro:${hood}`], "vok");
    const art = await draft("cidade", { neighborhoods: [hood] });
    await publishAs("human", art);
    await drainOnce();
    expect((await followSendOf(art))!).toMatchObject({
      status: "paused",
      status_reason: "vapid_invalid",
    });
    const { data: n } = await db
      .from("notifications")
      .select("title, severity, channel")
      .eq("dedupe_key", "push-vapid-invalid");
    expect(n).toEqual([
      { title: "Chaves VAPID inválidas", severity: "critical", channel: "control_center" },
    ]);
    for (const k of bad) server.respond(`/${run}/${k}`, 201);
  });

  it("403 isolado remove só a inscrição e o envio conclui (PWA-02)", async () => {
    const hood = `${HOOD}w`;
    const badId = await insertSub([`bairro:${hood}`], "iso-bad");
    server.respond(`/${run}/iso-bad`, 403);
    await insertSub([`bairro:${hood}`], "iso-ok");
    const art = await draft("cidade", { neighborhoods: [hood] });
    await publishAs("human", art);
    await drainOnce();
    expect((await followSendOf(art))!.status).toBe("sent");
    expect(received("iso-ok")).toBe(1);
    const { data } = await db.from("push_subscriptions").select("id").eq("id", badId);
    expect(data).toEqual([]);
    server.respond(`/${run}/iso-bad`, 201);
  });
});
