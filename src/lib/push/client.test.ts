// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { VAPID } = vi.hoisted(() => ({ VAPID: "B".repeat(87) }));
vi.mock("./public", () => ({ VAPID_PUBLIC_KEY: VAPID }));

const meta = new Map<string, unknown>();
vi.mock("@/sw/shared-db", () => ({
  getMeta: async (k: string) => meta.get(k) ?? null,
  setMeta: async (k: string, v: unknown) => void meta.set(k, v),
  delMeta: async (k: string) => void meta.delete(k),
}));

const profile = {
  value: {
    follows: [] as unknown[],
    alerts: [] as unknown[],
    history: [] as unknown[],
    interests: [] as unknown[],
    anonId: null as string | null,
  },
};
vi.mock("@/lib/anon/store", () => ({ getAnonStore: () => ({ get: async () => profile.value }) }));

const swMessages: unknown[] = [];
const subscription = {
  current: null as null | {
    endpoint: string;
    keys: { p256dh: string; auth: string };
    unsubscribed: boolean;
  },
};
const fakeSub = (endpoint: string) => {
  const s = {
    endpoint,
    keys: { p256dh: "B".repeat(87), auth: "a".repeat(22) },
    unsubscribed: false,
    toJSON() {
      return { endpoint, keys: s.keys };
    },
    async unsubscribe() {
      s.unsubscribed = true;
      subscription.current = null;
      return true;
    },
  };
  return s;
};
vi.mock("@/lib/offline/sw", () => ({
  registerSw: async () => ({
    pushManager: {
      getSubscription: async () => subscription.current,
      subscribe: async () => {
        const s = fakeSub(
          `https://fcm.googleapis.com/fcm/send/${Math.random().toString(36).slice(2)}`,
        );
        subscription.current = s;
        return s;
      },
    },
  }),
  sendConsentToSw: async (c: unknown) =>
    void swMessages.push({ type: "consent", ...(c as object) }),
}));

const tracked: unknown[] = [];
vi.mock("@/lib/events/send", () => ({
  trackWithConsent: async (_c: unknown, name: string, props: unknown) =>
    void tracked.push({ name, props }),
}));

import {
  currentPushState,
  disablePush,
  enablePush,
  pushSupport,
  resetPushStateForTests,
  syncPush,
  updatePushPrefs,
} from "./client";

const fetchCalls: {
  url: string;
  method: string;
  body: string | null;
  headers: Record<string, string>;
}[] = [];
let responder: (url: string, init: RequestInit) => Response = () =>
  Response.json({ id: "s1", token: "t1" }, { status: 201 });

beforeEach(() => {
  meta.clear();
  swMessages.length = 0;
  tracked.length = 0;
  fetchCalls.length = 0;
  subscription.current = null;
  resetPushStateForTests();
  profile.value = { follows: [], alerts: [], history: [], interests: [], anonId: null };
  document.cookie = "cn_consent=v1|m0|p0; Path=/";
  Object.defineProperty(window, "Notification", {
    value: { permission: "default", requestPermission: vi.fn().mockResolvedValue("granted") },
    configurable: true,
    writable: true,
  });
  Object.defineProperty(window, "PushManager", {
    value: function PushManager() {},
    configurable: true,
  });
  Object.defineProperty(navigator, "serviceWorker", { value: {}, configurable: true });
  vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
    fetchCalls.push({
      url,
      method: init.method ?? "GET",
      body: (init.body as string | null) ?? null,
      headers: (init.headers as Record<string, string>) ?? {},
    });
    return responder(url, init);
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("pushSupport", () => {
  it("default, denied, granted e sem chaves", () => {
    expect(pushSupport()).toBe("default");
    (window.Notification as unknown as { permission: string }).permission = "denied";
    expect(pushSupport()).toBe("denied");
  });
});

describe("enablePush", () => {
  it("Ativar concedido inscreve com os alvos explícitos e nada mais (critério 9)", async () => {
    profile.value = {
      follows: [{ kind: "source", id: "mt-agora", at: "x" }],
      alerts: [
        {
          id: "a",
          kind: "bairro",
          target: "cpa",
          label: "CPA",
          frequency: "immediate",
          channel: "browser",
          status: "active",
          at: "x",
        },
      ],
      history: [{ ref: "x" }],
      interests: [{ key: "politica" }],
      anonId: "00000000-0000-4000-8000-000000000001",
    };
    const r = await enablePush("follow");
    expect(r.ok).toBe(true);
    const post = fetchCalls.find((c) => c.method === "POST")!;
    const body = JSON.parse(post.body!);
    expect(body).toEqual({
      endpoint: expect.stringMatching(/^https:\/\/fcm\.googleapis\.com\//),
      keys: { p256dh: "B".repeat(87), auth: "a".repeat(22) },
      targets: ["source:mt-agora", "bairro:cpa"],
      installed: false,
      metricsConsent: false,
    });
    expect(JSON.stringify(body)).not.toMatch(/anonId|history|interests|politica/);
    expect(meta.get("push")).toMatchObject({ id: "s1", token: "t1", publicKey: VAPID });
    expect(currentPushState()).toMatchObject({
      status: "on",
      id: "s1",
      targets: ["source:mt-agora", "bairro:cpa"],
    });
    expect(tracked).toEqual([{ name: "notif_permission_granted", props: { trigger: "follow" } }]);
    expect(window.Notification.requestPermission).toHaveBeenCalled();
  });

  it("negada no diálogo nativo registra notif_permission_denied e não inscreve", async () => {
    (window.Notification.requestPermission as ReturnType<typeof vi.fn>).mockResolvedValue("denied");
    expect(await enablePush("alert")).toEqual({ ok: false, error: "denied" });
    expect(fetchCalls).toHaveLength(0);
    expect(tracked).toEqual([{ name: "notif_permission_denied", props: { trigger: "alert" } }]);
  });

  it("POST falhou depois do subscribe → unsubscribe e erro, sem contar recusa", async () => {
    responder = () => new Response("x", { status: 500 });
    const r = await enablePush("follow");
    expect(r).toEqual({ ok: false, error: "server_failed" });
    expect(subscription.current).toBeNull();
    expect(meta.has("push")).toBe(false);
    responder = () => Response.json({ error: "limite" }, { status: 429 });
    expect(await enablePush("follow")).toEqual({ ok: false, error: "rate_limited" });
    responder = () => Response.json({ id: "s1", token: "t1" }, { status: 201 });
  });

  it("409 refaz a inscrição no navegador e tenta de novo sem oldToken", async () => {
    let n = 0;
    responder = () =>
      ++n === 1
        ? Response.json({ error: "existe" }, { status: 409 })
        : Response.json({ id: "s2", token: "t2" }, { status: 201 });
    const r = await enablePush("settings");
    expect(r.ok && r.value).toMatchObject({ status: "on", id: "s2" });
    expect(fetchCalls.filter((c) => c.method === "POST")).toHaveLength(2);
    responder = () => Response.json({ id: "s1", token: "t1" }, { status: 201 });
  });
});

describe("syncPush e ajustes", () => {
  it("token perdido com permissão concedida → unsubscribe e estado lost", async () => {
    (window.Notification as unknown as { permission: string }).permission = "granted";
    const s = fakeSub("https://fcm.googleapis.com/fcm/send/x");
    subscription.current = s;
    expect((await syncPush(false)).status).toBe("lost");
    expect(s.unsubscribed).toBe(true);
    expect(fetchCalls).toHaveLength(0);
  });

  it("Métricas desligadas depois: PATCH metrics_consent=false e consent falso ao SW (Review Focus 5)", async () => {
    (window.Notification as unknown as { permission: string }).permission = "granted";
    subscription.current = fakeSub("https://fcm.googleapis.com/fcm/send/x");
    meta.set("push", { id: "s1", token: "t1", publicKey: VAPID });
    responder = () =>
      Response.json({
        id: "s1",
        targets: [],
        prefs: {
          follow: true,
          urgent: true,
          highlight: true,
          quietStart: 22,
          quietEnd: 7,
          dailyLimit: 3,
        },
        metricsConsent: false,
        installed: false,
      });
    const st = await syncPush(false);
    expect(st.status).toBe("on");
    const patch = fetchCalls.at(-1)!;
    expect(patch).toMatchObject({ method: "PATCH", url: "/api/push/subscriptions/s1" });
    expect(patch.headers.authorization).toBe("Bearer t1");
    expect(JSON.parse(patch.body!)).toMatchObject({
      metricsConsent: false,
      seen: true,
      targets: [],
    });
    expect(swMessages.at(-1)).toMatchObject({ type: "consent", metrics: false });
  });

  it("404 no PATCH vira lost; Desativar apaga no servidor e no navegador", async () => {
    (window.Notification as unknown as { permission: string }).permission = "granted";
    subscription.current = fakeSub("https://fcm.googleapis.com/fcm/send/x");
    meta.set("push", { id: "s1", token: "t1", publicKey: VAPID });
    responder = () => Response.json({ error: "não" }, { status: 404 });
    expect(await updatePushPrefs({ highlight: false })).toEqual({ ok: false, error: "lost" });
    expect(currentPushState().status).toBe("lost");
    meta.set("push", { id: "s1", token: "t1", publicKey: VAPID });
    subscription.current = fakeSub("https://fcm.googleapis.com/fcm/send/y");
    responder = () => new Response(null, { status: 204 });
    expect(await disablePush()).toEqual({ ok: true, value: undefined });
    expect(fetchCalls.at(-1)).toMatchObject({
      method: "DELETE",
      url: "/api/push/subscriptions/s1",
    });
    expect(subscription.current).toBeNull();
    expect(meta.has("push")).toBe(false);
    expect(currentPushState().status).toBe("off");
    expect(tracked.at(-1)).toEqual({ name: "push_unsubscribed", props: { from: "settings" } });
  });
});
