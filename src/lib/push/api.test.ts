import { describe, expect, it } from "vitest";
import { fakeResolve } from "@/lib/pipeline/testing/fake-http";
import {
  handleDelete,
  handlePatch,
  handleReceipt,
  handleRotate,
  handleSubscribe,
  type NewSubscription,
  type PushApiDeps,
  type PushSubscriptionStore,
  type SubscriptionRow,
} from "./api";
import { hashToken } from "./token";

const SITE = "https://citynews.example";
const FCM = "https://fcm.googleapis.com/fcm/send/abc";
const SEND = "b1000000-0000-4000-8000-000000000001";
const keys = { p256dh: "B".repeat(87), auth: "a".repeat(22) };
const valid = {
  endpoint: FCM,
  keys,
  targets: ["bairro:cpa"],
  installed: false,
  metricsConsent: false,
};

function memoryStore() {
  const rows = new Map<string, SubscriptionRow>();
  const receipts: unknown[] = [];
  let n = 0;
  const store: PushSubscriptionStore = {
    async findByEndpoint(endpoint) {
      for (const r of rows.values())
        if (r.endpoint === endpoint) return { id: r.id, tokenHash: r.tokenHash };
      return null;
    },
    async insert(row: NewSubscription) {
      const id = `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
      rows.set(id, { id, ...row });
      return { id };
    },
    async replace(id, row) {
      rows.set(id, { id, ...row });
    },
    async get(id) {
      return rows.get(id) ?? null;
    },
    async update(id, patch) {
      const r = rows.get(id)!;
      rows.set(id, {
        ...r,
        targets: patch.targets ?? r.targets,
        prefs: { ...r.prefs, ...(patch.prefs ?? {}) },
        metricsConsent: patch.metricsConsent ?? r.metricsConsent,
        installed: patch.installed ?? r.installed,
      });
    },
    async remove(id) {
      rows.delete(id);
    },
    async rotate(id, endpoint, k) {
      rows.set(id, { ...rows.get(id)!, endpoint, ...k });
    },
    async receiptHit(sendId, event, device, browser) {
      receipts.push({ sendId, event, device, browser });
      return true;
    },
  };
  return { store, rows, receipts };
}

function makeDeps(over: Partial<PushApiDeps> = {}) {
  const mem = memoryStore();
  const hits = new Map<string, number>();
  const deps: PushApiDeps = {
    store: mem.store,
    hitLimit: async (bucket, key, limit) => {
      const k = `${bucket}:${key}`;
      const n = (hits.get(k) ?? 0) + 1;
      hits.set(k, n);
      return n <= limit;
    },
    salt: "sal-de-teste",
    now: () => new Date("2026-09-28T15:00:00Z"),
    siteOrigin: SITE,
    resolve: fakeResolve({}),
    testHosts: [],
    enabled: true,
    ...over,
  };
  return { deps, ...mem };
}

function req(
  method: string,
  body: unknown,
  headers: Record<string, string> = {},
  path = "/api/push/subscriptions",
): Request {
  return new Request(`${SITE}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      origin: SITE,
      "x-forwarded-for": "203.0.113.9",
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}
const post = (body: unknown, headers: Record<string, string> = {}) => req("POST", body, headers);

describe("POST /api/push/subscriptions", () => {
  it("cria inscrição só com alvos explícitos e devolve token; banco guarda só o hash", async () => {
    const { deps, rows } = makeDeps();
    const res = await handleSubscribe(
      post(valid, {
        "user-agent": "Mozilla/5.0 (Linux; Android 14) Chrome/128 Mobile Safari/537.36",
      }),
      deps,
    );
    expect(res.status).toBe(201);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const { id, token } = await res.json();
    expect(rows.get(id)).toMatchObject({
      targets: ["bairro:cpa"],
      tokenHash: hashToken(token),
      browser: "chrome",
      deviceClass: "mobile",
      platform: "android",
      endpointHost: "fcm.googleapis.com",
      userId: null,
    });
    expect(JSON.stringify(rows.get(id))).not.toContain(token);
    expect(JSON.stringify(rows.get(id))).not.toContain("Mozilla");
  });

  it("campos fora do schema (anonId, history) são recusados", async () => {
    const { deps } = makeDeps();
    expect((await handleSubscribe(post({ ...valid, anonId: SEND }), deps)).status).toBe(400);
    expect((await handleSubscribe(post({ ...valid, history: [] }), deps)).status).toBe(400);
    expect((await handleSubscribe(post("{lixo"), deps)).status).toBe(400);
  });

  it("endpoint existente sem prova de posse → 409; com oldToken → token novo", async () => {
    const { deps } = makeDeps();
    const first = await (await handleSubscribe(post(valid), deps)).json();
    expect((await handleSubscribe(post(valid), deps)).status).toBe(409);
    expect((await handleSubscribe(post({ ...valid, oldToken: "x".repeat(40) }), deps)).status).toBe(
      409,
    );
    const again = await handleSubscribe(post({ ...valid, oldToken: first.token }), deps);
    expect(again.status).toBe(200);
    const { id, token } = await again.json();
    expect(id).toBe(first.id);
    expect(token).not.toBe(first.token);
  });

  it("SSRF: fora da allowlist, http, porta, credenciais e DNS privado → 400 sem requisição (Review Focus 4)", async () => {
    const calls: string[] = [];
    const resolve = async (h: string) => {
      calls.push(h);
      return h === "fcm.googleapis.com" ? ["10.0.0.5"] : ["93.184.215.14"];
    };
    const { deps, rows } = makeDeps({ resolve });
    for (const endpoint of [
      "https://evil.example/x",
      "http://fcm.googleapis.com/x",
      "https://fcm.googleapis.com:8443/x",
      "https://u:p@fcm.googleapis.com/x",
      "https://fcm.googleapis.com/x",
    ])
      expect((await handleSubscribe(post({ ...valid, endpoint }), deps)).status, endpoint).toBe(
        400,
      );
    expect(rows.size).toBe(0);
    // Só o host permitido chega ao DNS; os outros são recusados antes.
    expect(calls).toEqual(["fcm.googleapis.com"]);
  });

  it("Origin de outro site → 403; corpo > 4 KB → 413; limite → 429; sem VAPID → 503", async () => {
    const { deps } = makeDeps();
    expect(
      (await handleSubscribe(post(valid, { origin: "https://evil.example" }), deps)).status,
    ).toBe(403);
    expect((await handleSubscribe(req("POST", valid, { origin: "" }), deps)).status).toBe(403);
    expect(
      (
        await handleSubscribe(
          post({
            ...valid,
            targets: Array.from({ length: 200 }, (_, i) => `topic:${"t".repeat(70)}${i}`),
          }),
          deps,
        )
      ).status,
    ).toBe(413);
    for (let i = 0; i < 10; i++)
      await handleSubscribe(post({ ...valid, endpoint: `${FCM}${i}` }), deps);
    const limited = await handleSubscribe(post({ ...valid, endpoint: `${FCM}z` }), deps);
    expect(limited.status).toBe(429);
    expect((await limited.json()).error).toBe(
      "Muitas tentativas. Tente de novo em alguns minutos.",
    );
    expect((await handleSubscribe(post(valid), { ...deps, enabled: false })).status).toBe(503);
    expect((await handleSubscribe(post(valid), { ...deps, salt: null })).status).toBe(503);
  });

  it("leitor com sessão fica ligado à inscrição", async () => {
    const { deps, rows } = makeDeps({ userId: async () => "u-1" });
    const { id } = await (await handleSubscribe(post(valid), deps)).json();
    expect(rows.get(id)!.userId).toBe("u-1");
  });
});

describe("PATCH, DELETE e rotate", () => {
  async function subscribed() {
    const ctx = makeDeps();
    const { id, token } = await (await handleSubscribe(post(valid), ctx.deps)).json();
    return { ...ctx, id, token };
  }
  const auth = (token: string) => ({ authorization: `Bearer ${token}` });

  it("PATCH com token errado → 404; silêncio 23h ou limite 4 → 400; salva preferências e alvos", async () => {
    const { deps, id, token, rows } = await subscribed();
    expect(
      (
        await handlePatch(
          req("PATCH", { seen: true }, auth("x".repeat(40)), `/api/push/subscriptions/${id}`),
          id,
          deps,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await handlePatch(
          req("PATCH", { seen: true }, {}, `/api/push/subscriptions/${id}`),
          id,
          deps,
        )
      ).status,
    ).toBe(404);
    expect(
      (await handlePatch(req("PATCH", { seen: true }, auth(token)), "nao-existe", deps)).status,
    ).toBe(404);
    expect(
      (await handlePatch(req("PATCH", { prefs: { quietStart: 23 } }, auth(token)), id, deps))
        .status,
    ).toBe(400);
    expect(
      (await handlePatch(req("PATCH", { prefs: { dailyLimit: 4 } }, auth(token)), id, deps)).status,
    ).toBe(400);
    expect((await handlePatch(req("PATCH", { anonId: SEND }, auth(token)), id, deps)).status).toBe(
      400,
    );
    const ok = await handlePatch(
      req(
        "PATCH",
        {
          prefs: { highlight: false, quietStart: 20 },
          targets: ["section:cidade"],
          metricsConsent: true,
        },
        auth(token),
      ),
      id,
      deps,
    );
    expect(ok.status).toBe(200);
    const body = await ok.json();
    expect(body).toEqual({
      id,
      targets: ["section:cidade"],
      prefs: {
        follow: true,
        urgent: true,
        highlight: false,
        quietStart: 20,
        quietEnd: 7,
        dailyLimit: 3,
      },
      metricsConsent: true,
      installed: false,
    });
    expect(JSON.stringify(body)).not.toMatch(/endpoint|p256dh|tokenHash/);
    expect(rows.get(id)!.metricsConsent).toBe(true);
  });

  it("PATCH/DELETE com id que não é UUID: 404 sem tocar no rate limit (PWA-05)", async () => {
    const buckets: string[] = [];
    const { deps } = makeDeps({
      hitLimit: async (bucket) => {
        buckets.push(bucket);
        return true;
      },
    });
    for (const bad of ["nao-existe", "x".repeat(5000), "../../etc"]) {
      expect(
        (await handlePatch(req("PATCH", { seen: true }, auth("t".repeat(40))), bad, deps)).status,
      ).toBe(404);
      expect(
        (await handleDelete(req("DELETE", null, auth("t".repeat(40))), bad, deps)).status,
      ).toBe(404);
    }
    expect(buckets).toEqual([]);
  });

  it("PATCH também tem limite por IP, além do limite por inscrição (PWA-05)", async () => {
    const { deps } = await subscribed();
    let last = 0;
    for (let i = 0; i < 130; i++) {
      const id = `00000000-0000-4000-8000-${String(1000 + i).padStart(12, "0")}`;
      last = (await handlePatch(req("PATCH", { seen: true }, auth("t".repeat(40))), id, deps))
        .status;
    }
    expect(last).toBe(429);
  });

  it("DELETE e PATCH continuam valendo sem chaves VAPID; criação e rotação não (PWA-15)", async () => {
    const { deps, id, token } = await subscribed();
    const off = { ...deps, enabled: false };
    expect((await handlePatch(req("PATCH", { seen: true }, auth(token)), id, off)).status).toBe(
      200,
    );
    expect((await handleDelete(req("DELETE", null, auth(token)), id, off)).status).toBe(204);
    expect((await handleSubscribe(post(valid), off)).status).toBe(503);
  });

  it("DELETE apaga com token; sem token 404", async () => {
    const { deps, id, token, rows } = await subscribed();
    expect((await handleDelete(req("DELETE", null, {}), id, deps)).status).toBe(404);
    expect((await handleDelete(req("DELETE", null, auth(token)), id, deps)).status).toBe(204);
    expect(rows.size).toBe(0);
  });

  it("rotate troca endpoint e chaves com token e endpoint antigo; novo endpoint também passa pela allowlist", async () => {
    const { deps, id, token, rows } = await subscribed();
    const body = {
      oldEndpoint: FCM,
      endpoint: "https://web.push.apple.com/x",
      keys: { p256dh: "C".repeat(87), auth: "b".repeat(22) },
    };
    expect((await handleRotate(req("PUT", body, {}), deps)).status).toBe(404);
    expect(
      (
        await handleRotate(
          req("PUT", { ...body, endpoint: "https://evil.example/x" }, auth(token)),
          deps,
        )
      ).status,
    ).toBe(400);
    const ok = await handleRotate(req("PUT", body, auth(token)), deps);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ id });
    expect(rows.get(id)).toMatchObject({ endpoint: body.endpoint, p256dh: body.keys.p256dh });
  });
});

describe("POST /api/push/receipt (Review Focus 5)", () => {
  const receipt = { s: SEND, e: "clicked", d: "mobile", b: "chrome" };
  it("sem Métricas no cookie não grava; com Métricas grava sem id de inscrição", async () => {
    const { deps, receipts } = makeDeps();
    const res = await handleReceipt(post(receipt, { cookie: "cn_consent=v1|m0|p0" }), deps);
    expect(res.status).toBe(204);
    expect(receipts).toHaveLength(0);
    expect((await handleReceipt(post(receipt), deps)).status).toBe(204);
    expect(receipts).toHaveLength(0);
    expect(
      (await handleReceipt(post(receipt, { cookie: "cn_consent=v1|m1|p0" }), deps)).status,
    ).toBe(204);
    expect(receipts).toEqual([
      { sendId: SEND, event: "clicked", device: "mobile", browser: "chrome" },
    ]);
  });
  it("corpo estrito e Origin", async () => {
    const { deps } = makeDeps();
    expect(
      (await handleReceipt(post({ ...receipt, id: "x" }, { cookie: "cn_consent=v1|m1|p0" }), deps))
        .status,
    ).toBe(400);
    expect(
      (await handleReceipt(post(receipt, { origin: "https://evil.example" }), deps)).status,
    ).toBe(403);
  });
});
