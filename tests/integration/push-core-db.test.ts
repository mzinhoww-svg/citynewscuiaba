// @vitest-environment node
// Migration 0040 (PWA/push, PW-T1): inscrições, envios, entregas e a reserva atômica
// `push_reserve` (spec docs/superpowers/specs/2026-09-28-pwa-notificacoes-design.md §11, D-P07,
// D-P08, D-P16; Review Focus 2 e 3 do plano). Pilha local, dados criados pelo próprio teste.
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServiceClient, type DbClient } from "@/lib/db/client";
import type { Database } from "@/lib/db/types";

const SEED_PASSWORD = "citynews-local-123";
const JULIANA = "c1000000-0000-4000-8000-000000000004"; // jornalista, aqui como leitora com conta
const ART = "c2000000-0000-4000-8000-000000000001";
const A1 = "c2000000-0000-4000-8000-000000000002";
const A2 = "c2000000-0000-4000-8000-000000000006";
const A3 = "c2000000-0000-4000-8000-000000000007";
const A4 = "c2000000-0000-4000-8000-000000000008";
const A5 = "c2000000-0000-4000-8000-000000000009";
/** Matérias do seed (qualquer status serve: só a FK importa); carregadas em `beforeAll`. */
let ARTICLES: string[] = [];

const service = createServiceClient();
const b64 = (n: number) => randomBytes(n).toString("base64url");
const run = Date.now();
let seq = 0;

function anonClient(): DbClient {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
const sessions = new Map<string, Promise<DbClient>>();
function as(email: string): Promise<DbClient> {
  const cached = sessions.get(email);
  if (cached) return cached;
  const client = anonClient();
  const ready = client.auth.signInWithPassword({ email, password: SEED_PASSWORD }).then((r) => {
    if (r.error) throw r.error;
    return client;
  });
  sessions.set(email, ready);
  return ready;
}

const subs: string[] = [];
const sends: string[] = [];

type SubPatch = Partial<Database["public"]["Tables"]["push_subscriptions"]["Insert"]>;
async function insertSub(patch: SubPatch = {}): Promise<string> {
  seq++;
  const { data, error } = await service
    .from("push_subscriptions")
    .insert({
      endpoint: `https://fcm.googleapis.com/fcm/send/t${run}-${seq}`,
      p256dh: b64(65),
      auth: b64(16),
      endpoint_host: "fcm.googleapis.com",
      manage_token_hash: b64(32),
      targets: ["section:cidade"],
      ...patch,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  subs.push(data.id);
  return data.id;
}

async function insertSend(input: {
  kind: "follow" | "urgent" | "highlight";
  article?: string;
  startedAt?: string;
}): Promise<string> {
  seq++;
  if (input.kind === "follow" && input.article) {
    // Um envio `follow` por matéria (índice único): as suítes reaproveitam o existente.
    const existing = await service
      .from("push_sends")
      .select("id")
      .eq("kind", "follow")
      .eq("article_id", input.article)
      .maybeSingle();
    if (existing.data) return existing.data.id;
  }
  const { data, error } = await service
    .from("push_sends")
    .insert({
      kind: input.kind,
      article_id: input.article ?? ARTICLES[seq % ARTICLES.length]!,
      title: "Título de teste",
      body: "Corpo de teste",
      origin_label: "ORIGINAL CITYNEWS",
      url: "/materia/teste",
      tag: `t${seq}`,
      audience: input.kind === "follow" ? { type: "targets" } : { type: "all" },
      status: "dispatching",
      requested_by: input.kind === "follow" ? null : JULIANA,
      started_at: input.startedAt ?? null,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  sends.push(data.id);
  return data.id;
}

async function reserve(sub: string, send: string, at = "2026-09-28T15:00:00Z") {
  const { data, error } = await service.rpc("push_reserve", {
    p_sub: sub,
    p_send: send,
    p_now: at,
  });
  if (error) throw new Error(error.message);
  return data!;
}

async function result(
  id: number,
  outcome: "accepted" | "gone" | "retry" | "failed",
  http: number,
  error?: string,
  retryAt?: string,
) {
  const { error: e } = await service.rpc("push_delivery_result", {
    p_delivery: id,
    p_outcome: outcome,
    p_http: http,
    ...(error ? { p_error: error } : {}),
    ...(retryAt ? { p_retry_at: retryAt } : {}),
  });
  if (e) throw new Error(e.message);
}

async function deliveries(sub: string) {
  const { data, error } = await service
    .from("push_deliveries")
    .select("id, article_id, status, skip_reason, not_before, attempts")
    .eq("subscription_id", sub)
    .order("id");
  if (error) throw new Error(error.message);
  return data;
}

let readerSub = "";

beforeAll(async () => {
  const { data } = await service.from("articles").select("id").order("id").limit(60);
  ARTICLES = (data ?? []).map((r) => r.id);
  expect(ARTICLES.length).toBeGreaterThanOrEqual(12);
  readerSub = await insertSub({ user_id: JULIANA });
});

afterAll(async () => {
  if (sends.length) await service.from("push_sends").delete().in("id", sends);
  if (subs.length) await service.from("push_subscriptions").delete().in("id", subs);
  await service.from("push_send_counters").delete().in("send_id", sends);
});

describe("RLS e checks", () => {
  it("anon não lê nada; leitor vê só as próprias sem chaves; equipe não lê a tabela", async () => {
    const anon = await anonClient().from("push_subscriptions").select("id");
    expect(anon.data ?? []).toEqual([]);
    const juliana = await as("juliana.campos@citynews.local");
    const mine = await juliana.from("my_push_subscriptions").select("*");
    expect(mine.error).toBeNull();
    expect(mine.data).toHaveLength(1);
    expect(mine.data![0]!.id).toBe(readerSub);
    expect(Object.keys(mine.data![0]!)).not.toEqual(
      expect.arrayContaining(["endpoint", "p256dh", "auth", "manage_token_hash"]),
    );
    const helena = await as("helena.costa@citynews.local");
    const staff = await helena.from("push_subscriptions").select("id");
    expect(staff.data ?? []).toEqual([]);
    const keys = await helena.from("push_subscriptions").select("endpoint");
    expect(keys.error).not.toBeNull();
    const del = await helena.from("push_deliveries").select("id");
    expect(del.data ?? []).toEqual([]);
  });

  it("alvo fora do formato e mais de 200 alvos são recusados", async () => {
    await expect(insertSub({ targets: ["interesse:politica"] })).rejects.toThrow(/check|viol/);
    await expect(
      insertSub({ targets: Array.from({ length: 201 }, (_, i) => `topic:t${i}`) }),
    ).rejects.toThrow(/check|viol/);
    await expect(insertSub({ quiet_start: 23 })).rejects.toThrow(/check|viol/);
    await expect(insertSub({ daily_limit: 4 })).rejects.toThrow(/check|viol/);
    await expect(insertSub({ endpoint: "ftp://x" })).rejects.toThrow(/check|viol/);
  });

  it("envio urgente sem requested_by é recusado; um follow por matéria", async () => {
    const bad = await service.from("push_sends").insert({
      kind: "urgent",
      article_id: ART,
      title: "t",
      body: "b",
      origin_label: "ORIGINAL CITYNEWS",
      url: "/materia/x",
      tag: "x",
      audience: { type: "all" },
    });
    expect(bad.error).not.toBeNull();
    await insertSend({ kind: "follow", article: A5 });
    const twice = await service.from("push_sends").insert({
      kind: "follow",
      article_id: A5,
      title: "t",
      body: "b",
      origin_label: "ORIGINAL CITYNEWS",
      url: "/materia/x",
      tag: "x",
    });
    expect(twice.error?.message).toMatch(/duplicate|unique/);
  });
});

describe("push_reserve", () => {
  it("10 reservas paralelas de envios diferentes nunca passam do limite (Review Focus 3)", async () => {
    const sub = await insertSub({ daily_limit: 3 });
    const ten = await Promise.all(Array.from({ length: 10 }, () => insertSend({ kind: "urgent" })));
    const r = await Promise.all(ten.map((s) => reserve(sub, s, "2026-09-28T15:00:00Z")));
    expect(r.filter((x) => x[0]!.outcome === "ok")).toHaveLength(3);
    expect(r.filter((x) => x[0]!.outcome === "skipped_limit")).toHaveLength(7);
    const row = await service
      .from("push_subscriptions")
      .select("day_count, day_key")
      .eq("id", sub)
      .single();
    expect(row.data).toEqual({ day_count: 3, day_key: "2026-09-28" });
  });

  it("a mesma matéria nunca duas vezes; pulada não bloqueia depois", async () => {
    const sub = await insertSub({ daily_limit: 3 });
    const a = await insertSend({ kind: "follow", article: ART });
    const b = await insertSend({ kind: "highlight", article: ART });
    expect((await reserve(sub, a))[0]!.outcome).toBe("ok");
    expect((await reserve(sub, b))[0]!.outcome).toBe("skipped_duplicate");
    const c = await insertSend({ kind: "urgent", article: A1 });
    const d = await insertSend({ kind: "urgent", article: A2 });
    const e = await insertSend({ kind: "urgent", article: A3 });
    await reserve(sub, c);
    await reserve(sub, d);
    // A 4ª do dia é pulada por limite: a linha `skipped` não impede a mesma matéria amanhã.
    expect((await reserve(sub, e))[0]!.outcome).toBe("skipped_limit");
    expect((await reserve(sub, e, "2026-09-29T15:00:00Z"))[0]!.outcome).toBe("ok");
    const sendRow = await service
      .from("push_sends")
      .select("skipped_duplicate_n")
      .eq("id", b)
      .single();
    expect(sendRow.data!.skipped_duplicate_n).toBe(1);
  });

  it("preferência desligada pula com skipped_pref", async () => {
    const sub = await insertSub({ want_highlight: false });
    const r = await reserve(sub, await insertSend({ kind: "highlight" }));
    expect(r[0]!.outcome).toBe("skipped_pref");
    expect(await deliveries(sub)).toEqual([
      expect.objectContaining({ status: "skipped", skip_reason: "pref" }),
    ]);
  });

  it("follow no silêncio fica deferred e agrupa: só o mais recente continua", async () => {
    const sub = await insertSub({});
    const at = "2026-09-29T02:30:00Z"; // 22:30 de Cuiabá; fim do silêncio 07:00 > TTL 6 h
    const r1 = await reserve(sub, await insertSend({ kind: "follow", article: A1 }), at);
    const r2 = await reserve(sub, await insertSend({ kind: "follow", article: A2 }), at);
    expect([r1[0]!.outcome, r2[0]!.outcome]).toEqual(["skipped_quiet", "skipped_quiet"]);
    const early = "2026-09-29T09:30:00Z"; // 05:30, fim 07:00 cabe no TTL
    const r3 = await reserve(sub, await insertSend({ kind: "follow", article: A3 }), early);
    expect(r3[0]!.outcome).toBe("deferred");
    const r4 = await reserve(sub, await insertSend({ kind: "follow", article: A4 }), early);
    expect(r4[0]!.outcome).toBe("deferred");
    const rows = await deliveries(sub);
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ article_id: A3, status: "skipped", skip_reason: "coalesced" }),
        expect.objectContaining({
          article_id: A4,
          status: "deferred",
          not_before: "2026-09-29T11:00:00+00:00",
        }),
      ]),
    );
    // Destaque no silêncio também adia (TTL 12 h), mas não agrupa com o follow.
    const r5 = await reserve(sub, await insertSend({ kind: "highlight", article: A5 }), at);
    expect(r5[0]!.outcome).toBe("deferred");
    expect((await deliveries(sub)).filter((d) => d.status === "deferred")).toHaveLength(2);
  });

  it("silêncio efetivo é a união com o do leitor (G6); urgente passa e conta no limite", async () => {
    // Leitor começa mais cedo (20h): 20:30 de Cuiabá (00:30Z) já é silêncio → adia até 07:00 (11:00Z).
    const early = await insertSub({ quiet_start: 20, quiet_end: 7, daily_limit: 2 });
    const r = await reserve(
      early,
      await insertSend({ kind: "highlight", article: A1 }),
      "2026-09-29T00:30:00Z",
    );
    expect(r[0]!.outcome).toBe("deferred");
    expect((await deliveries(early))[0]!.not_before).toBe("2026-09-29T11:00:00+00:00");
    expect(
      (
        await reserve(
          early,
          await insertSend({ kind: "urgent", article: A2 }),
          "2026-09-29T00:30:00Z",
        )
      )[0]!.outcome,
    ).toBe("ok");
    expect(
      (
        await reserve(
          early,
          await insertSend({ kind: "urgent", article: A3 }),
          "2026-09-29T00:30:00Z",
        )
      )[0]!.outcome,
    ).toBe("ok");
    expect(
      (
        await reserve(
          early,
          await insertSend({ kind: "urgent", article: A4 }),
          "2026-09-29T00:30:00Z",
        )
      )[0]!.outcome,
    ).toBe("skipped_limit");
    // Leitor termina mais tarde (9h): 07:30 de Cuiabá (11:30Z) ainda é silêncio → adia até 09:00 (13:00Z).
    const late = await insertSub({ quiet_start: 22, quiet_end: 9 });
    const r2 = await reserve(
      late,
      await insertSend({ kind: "follow", article: A1 }),
      "2026-09-29T11:30:00Z",
    );
    expect(r2[0]!.outcome).toBe("deferred");
    expect((await deliveries(late))[0]!.not_before).toBe("2026-09-29T13:00:00+00:00");
    // Fora das duas janelas (10:00 local) segue na hora.
    expect(
      (
        await reserve(
          late,
          await insertSend({ kind: "follow", article: A2 }),
          "2026-09-29T14:00:00Z",
        )
      )[0]!.outcome,
    ).toBe("ok");
  });

  it("dia de Cuiabá vira às 04:00Z (Review Focus 2, parte banco)", async () => {
    const sub = await insertSub({ daily_limit: 1 });
    const urgent = () => insertSend({ kind: "urgent" });
    expect((await reserve(sub, await urgent(), "2026-09-29T03:59:00Z"))[0]!.outcome).toBe("ok");
    expect((await reserve(sub, await urgent(), "2026-09-29T03:59:30Z"))[0]!.outcome).toBe(
      "skipped_limit",
    );
    expect((await reserve(sub, await urgent(), "2026-09-29T04:00:00Z"))[0]!.outcome).toBe("ok");
  });

  it("push_claim_due reconfere limite e TTL do adiado", async () => {
    const sub = await insertSub({ daily_limit: 1 });
    const at = "2026-09-29T09:30:00Z";
    const r = await reserve(sub, await insertSend({ kind: "follow", article: A1 }), at);
    expect(r[0]!.outcome).toBe("deferred");
    const id = r[0]!.delivery_id!;
    // Outra entrega consome o único aviso do dia antes do fim do silêncio.
    expect(
      (
        await reserve(
          sub,
          await insertSend({ kind: "urgent", article: A2 }),
          "2026-09-29T10:00:00Z",
        )
      )[0]!.outcome,
    ).toBe("ok");
    const claimed = await service.rpc("push_claim_due", {
      p_delivery: id,
      p_now: "2026-09-29T11:00:00Z",
    });
    expect(claimed.data).toBe("skipped_limit");
    // Um adiado além do TTL expira.
    const sub2 = await insertSub({});
    const r2 = await reserve(sub2, await insertSend({ kind: "follow", article: A3 }), at);
    const late = await service.rpc("push_claim_due", {
      p_delivery: r2[0]!.delivery_id!,
      p_now: "2026-09-29T20:00:00Z",
    });
    expect(late.data).toBe("expired");
    const r3 = await reserve(sub2, await insertSend({ kind: "follow", article: A4 }), at);
    const okClaim = await service.rpc("push_claim_due", {
      p_delivery: r3[0]!.delivery_id!,
      p_now: "2026-09-29T11:00:00Z",
    });
    expect(okClaim.data).toBe("ok");
    expect((await deliveries(sub2)).find((d) => d.article_id === A4)).toMatchObject({
      status: "queued",
    });
  });
});

describe("push_delivery_result", () => {
  async function queued(sub: string, article: string, kind: "urgent" | "follow" = "urgent") {
    const r = await reserve(sub, await insertSend({ kind, article }), "2026-09-28T15:00:00Z");
    expect(r[0]!.outcome).toBe("ok");
    return r[0]!.delivery_id!;
  }

  it("404/410 apaga a inscrição; retry reagenda; 5 falhas em dias diferentes apagam", async () => {
    const gone = await insertSub({});
    const d1 = await queued(gone, A1);
    await result(d1, "gone", 410);
    expect((await service.from("push_subscriptions").select("id").eq("id", gone)).data).toEqual([]);

    const sub = await insertSub({});
    const d2 = await queued(sub, A1);
    await result(d2, "retry", 429, "429", "2026-09-28T15:15:00Z");
    expect((await deliveries(sub))[0]).toMatchObject({
      status: "queued",
      attempts: 1,
      not_before: "2026-09-28T15:15:00+00:00",
    });
    await result(d2, "accepted", 201);
    expect((await deliveries(sub))[0]).toMatchObject({ status: "sent" });
    const s = await service
      .from("push_subscriptions")
      .select("consecutive_failures, last_success_at")
      .eq("id", sub)
      .single();
    expect(s.data!.consecutive_failures).toBe(0);
    expect(s.data!.last_success_at).not.toBeNull();

    // Falhas 5xx esgotadas em dias diferentes apagam a inscrição.
    const flaky = await insertSub({});
    const arts = [A1, A2, A3, A4, A5];
    for (let i = 0; i < 5; i++) {
      const day = `2026-10-0${i + 1}T15:00:00Z`;
      const r = await reserve(flaky, await insertSend({ kind: "urgent", article: arts[i]! }), day);
      await service
        .from("push_deliveries")
        .update({ created_at: day })
        .eq("id", r[0]!.delivery_id!);
      await result(r[0]!.delivery_id!, "failed", 500, "500");
      const still = (
        await service.from("push_subscriptions").select("consecutive_failures").eq("id", flaky)
      ).data;
      if (i < 4) expect(still).toEqual([{ consecutive_failures: i + 1 }]);
      else expect(still).toEqual([]);
    }
  });

  it("aceito soma sent_measurable só com consentimento de métricas", async () => {
    const yes = await insertSub({
      metrics_consent: true,
      device_class: "mobile",
      browser: "chrome",
    });
    const no = await insertSub({ metrics_consent: false });
    const send = await insertSend({ kind: "urgent", article: A5 });
    const a = await reserve(yes, send);
    const b = await reserve(no, send);
    await result(a[0]!.delivery_id!, "accepted", 201);
    await result(b[0]!.delivery_id!, "accepted", 201);
    const row = await service
      .from("push_sends")
      .select("accepted_n, sent_measurable_n, queued_n")
      .eq("id", send)
      .single();
    expect(row.data).toEqual({ accepted_n: 2, sent_measurable_n: 1, queued_n: 2 });
    const d = await service
      .from("push_deliveries")
      .select("measurable, device_class, browser")
      .eq("id", a[0]!.delivery_id!)
      .single();
    expect(d.data).toEqual({ measurable: true, device_class: "mobile", browser: "chrome" });
  });
});

describe("recibos e retenção", () => {
  it("recibo só para envio iniciado há menos de 48 h e sem id de inscrição", async () => {
    const NOW = "2026-09-28T15:00:00Z";
    const old = await insertSend({ kind: "urgent", startedAt: "2026-09-20T15:00:00Z" });
    const recent = await insertSend({ kind: "urgent", startedAt: "2026-09-28T14:00:00Z" });
    const r1 = await service.rpc("push_receipt_hit", {
      p_send: old,
      p_event: "clicked",
      p_device: "mobile",
      p_browser: "chrome",
      p_now: NOW,
    });
    expect(r1.data).toBe(false);
    const r2 = await service.rpc("push_receipt_hit", {
      p_send: recent,
      p_event: "delivered",
      p_device: "mobile",
      p_browser: "chrome",
      p_now: NOW,
    });
    expect(r2.data).toBe(true);
    await service.rpc("push_receipt_hit", {
      p_send: recent,
      p_event: "clicked",
      p_device: "mobile",
      p_browser: "chrome",
      p_now: NOW,
    });
    const row = await service.from("push_send_counters").select("*").eq("send_id", recent).single();
    expect(Object.keys(row.data!)).not.toContain("subscription_id");
    expect(row.data).toMatchObject({
      device_class: "mobile",
      browser: "chrome",
      delivered: 1,
      clicked: 1,
    });
    const bad = await service.rpc("push_receipt_hit", {
      p_send: recent,
      p_event: "opened",
      p_device: "mobile",
      p_browser: "chrome",
      p_now: NOW,
    });
    expect(bad.data).toBe(false);
  });

  it("retenção: entregas > 30 dias e inscrições sem visita há 180 dias", async () => {
    const stale = await insertSub({ last_seen_at: "2026-01-01T00:00:00Z" });
    const fresh = await insertSub({ last_seen_at: "2026-09-20T00:00:00Z" });
    const r = await reserve(fresh, await insertSend({ kind: "urgent", article: A1 }));
    await service
      .from("push_deliveries")
      .update({ created_at: "2026-08-01T00:00:00Z" })
      .eq("id", r[0]!.delivery_id!);
    const out = await service.rpc("push_retention", { p_now: "2026-09-28T15:00:00Z" });
    expect(out.error).toBeNull();
    expect(out.data).toMatchObject({
      deliveries: expect.any(Number),
      subscriptions: expect.any(Number),
    });
    expect((await service.from("push_subscriptions").select("id").eq("id", stale)).data).toEqual(
      [],
    );
    expect(
      (await service.from("push_subscriptions").select("id").eq("id", fresh)).data,
    ).toHaveLength(1);
    expect(
      (await service.from("push_deliveries").select("id").eq("id", r[0]!.delivery_id!)).data,
    ).toEqual([]);
  });
});
