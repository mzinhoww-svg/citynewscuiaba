// @vitest-environment node
// Rotas /api/push/* ponta a ponta no banco local (PW-T6): POST, PATCH, rotate, DELETE e o recibo
// agregado (Review Focus 5). Endpoints de teste em 127.0.0.1 via PUSH_ENDPOINT_TEST_HOSTS.
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServiceClient } from "@/lib/db/client";
import { createPushSubscriptionStore } from "@/lib/db/push-store";
import { fakeResolve } from "@/lib/pipeline/testing/fake-http";
import {
  handleDelete,
  handlePatch,
  handleReceipt,
  handleRotate,
  handleSubscribe,
  type PushApiDeps,
} from "@/lib/push/api";
import { hashToken } from "@/lib/push/token";

const SITE = "http://localhost:3600";
const service = createServiceClient();
const run = randomBytes(4).toString("hex");
const keys = {
  p256dh: randomBytes(65).toString("base64url"),
  auth: randomBytes(16).toString("base64url"),
};
const endpoint = `https://fcm.googleapis.com/fcm/send/rt-${run}`;
const ids: string[] = [];
const sends: string[] = [];
const IP = `198.51.100.${Math.floor(Math.random() * 200) + 1}`;

const deps: PushApiDeps = {
  store: createPushSubscriptionStore(service),
  hitLimit: async () => true,
  salt: "sal-de-teste",
  now: () => new Date(),
  siteOrigin: SITE,
  resolve: fakeResolve({}),
  testHosts: [],
  enabled: true,
  userId: async () => null,
};

function req(method: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(`${SITE}/api/push/x`, {
    method,
    headers: {
      "content-type": "application/json",
      origin: SITE,
      "x-forwarded-for": IP,
      "user-agent":
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
      ...headers,
    },
    body: body === null ? null : JSON.stringify(body),
  });
}

afterAll(async () => {
  if (ids.length) await service.from("push_subscriptions").delete().in("id", ids);
  if (sends.length) await service.from("push_sends").delete().in("id", sends);
});

describe("/api/push/subscriptions", () => {
  let id = "";
  let token = "";

  it("POST cria a linha com hash do token, família do navegador e sem UA", async () => {
    const res = await handleSubscribe(
      req("POST", {
        endpoint,
        keys,
        targets: ["section:cidade", "bairro:cpa"],
        installed: true,
        metricsConsent: true,
      }),
      deps,
    );
    expect(res.status).toBe(201);
    ({ id, token } = await res.json());
    ids.push(id);
    const { data } = await service.from("push_subscriptions").select("*").eq("id", id).single();
    expect(data).toMatchObject({
      endpoint,
      endpoint_host: "fcm.googleapis.com",
      manage_token_hash: hashToken(token),
      targets: ["section:cidade", "bairro:cpa"],
      browser: "safari",
      device_class: "mobile",
      platform: "ios",
      installed: true,
      metrics_consent: true,
      want_follow: true,
      daily_limit: 3,
    });
    expect(JSON.stringify(data)).not.toContain(token);
    expect(JSON.stringify(data)).not.toContain("Mozilla");
  });

  it("PATCH salva preferências dentro dos trilhos e atualiza last_seen_at", async () => {
    const before = (
      await service.from("push_subscriptions").select("last_seen_at").eq("id", id).single()
    ).data!.last_seen_at;
    await new Promise((r) => setTimeout(r, 20));
    const res = await handlePatch(
      req(
        "PATCH",
        {
          prefs: { highlight: false, quietStart: 20, quietEnd: 9, dailyLimit: 2 },
          metricsConsent: false,
          seen: true,
        },
        { authorization: `Bearer ${token}` },
      ),
      id,
      deps,
    );
    expect(res.status).toBe(200);
    const { data } = await service
      .from("push_subscriptions")
      .select("want_highlight, quiet_start, quiet_end, daily_limit, metrics_consent, last_seen_at")
      .eq("id", id)
      .single();
    expect(data).toMatchObject({
      want_highlight: false,
      quiet_start: 20,
      quiet_end: 9,
      daily_limit: 2,
      metrics_consent: false,
    });
    expect(Date.parse(data!.last_seen_at)).toBeGreaterThan(Date.parse(before));
    expect(
      (
        await handlePatch(
          req("PATCH", { prefs: { quietStart: 23 } }, { authorization: `Bearer ${token}` }),
          id,
          deps,
        )
      ).status,
    ).toBe(400);
  });

  it("rotate troca endpoint e chaves; DELETE apaga", async () => {
    const next = `https://web.push.apple.com/rt-${run}`;
    const res = await handleRotate(
      req(
        "PUT",
        {
          oldEndpoint: endpoint,
          endpoint: next,
          keys: {
            p256dh: randomBytes(65).toString("base64url"),
            auth: randomBytes(16).toString("base64url"),
          },
        },
        { authorization: `Bearer ${token}` },
      ),
      deps,
    );
    expect(res.status).toBe(200);
    expect(
      (await service.from("push_subscriptions").select("endpoint").eq("id", id).single()).data!
        .endpoint,
    ).toBe(next);
    expect(
      (await handleDelete(req("DELETE", null, { authorization: `Bearer ${token}` }), id, deps))
        .status,
    ).toBe(204);
    expect((await service.from("push_subscriptions").select("id").eq("id", id)).data).toEqual([]);
  });
});

describe("/api/push/receipt", () => {
  let sendId = "";
  beforeAll(async () => {
    const { data: a } = await service
      .from("articles")
      .select("id")
      .eq("status", "published")
      .limit(1)
      .single();
    const { data, error } = await service
      .from("push_sends")
      .insert({
        kind: "urgent",
        article_id: a!.id,
        title: "t",
        body: "b",
        origin_label: "ORIGINAL CITYNEWS",
        url: "/materia/x",
        tag: "x",
        audience: { type: "all" },
        status: "sent",
        requested_by: "c1000000-0000-4000-8000-000000000002",
        started_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    sendId = data.id;
    sends.push(sendId);
  });

  it("com Métricas soma em push_send_counters sem id de inscrição; sem Métricas não grava", async () => {
    const body = { s: sendId, e: "delivered", d: "mobile", b: "safari" };
    expect(
      (await handleReceipt(req("POST", body, { cookie: "cn_consent=v1|m0|p0" }), deps)).status,
    ).toBe(204);
    expect(
      (await service.from("push_send_counters").select("*").eq("send_id", sendId)).data,
    ).toEqual([]);
    expect(
      (await handleReceipt(req("POST", body, { cookie: "cn_consent=v1|m1|p0" }), deps)).status,
    ).toBe(204);
    expect(
      (
        await handleReceipt(
          req("POST", { ...body, e: "clicked" }, { cookie: "cn_consent=v1|m1|p1" }),
          deps,
        )
      ).status,
    ).toBe(204);
    const { data } = await service.from("push_send_counters").select("*").eq("send_id", sendId);
    expect(data).toEqual([
      { send_id: sendId, device_class: "mobile", browser: "safari", delivered: 1, clicked: 1 },
    ]);
    expect(Object.keys(data![0]!)).not.toContain("subscription_id");
  });
});
