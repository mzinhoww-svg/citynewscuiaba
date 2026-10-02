// @vitest-environment node
// Sender VAPID (PW-T6, spec §12.3, §16): web-push real contra o servidor de push falso em
// 127.0.0.1. Par VAPID gerado em tempo de execução; nenhuma chave em fixture (spec §14).
import webpush from "web-push";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fakeResolve } from "@/lib/pipeline/testing/fake-http";
import { buildPayload, pushHeaders } from "@/lib/push/payload";
import { createWebPushSender, type PushSender } from "@/lib/push/sender";
import type { VapidConfig } from "@/lib/push/server";
import { browserKeys, startFakePushServer, type FakePushServer } from "../support/fake-push-server";

const SEND = "b1000000-0000-4000-8000-000000000001";
const TAG = "c2000000000040008000000000000001";
let server: FakePushServer;
let vapid: VapidConfig;
let sender: PushSender;
const keys = browserKeys();

const payload = (() => {
  const r = buildPayload({
    title: "Chuva forte",
    body: "Defesa Civil alerta",
    originLabel: "ORIGINAL CITYNEWS",
    url: "/materia/chuva",
    tag: TAG,
    sendId: SEND,
  });
  if (!r.ok) throw new Error(r.error);
  return r.value;
})();

const sub = (path: string) => ({
  endpoint: `${server.origin}${path}`,
  p256dh: keys.p256dh,
  auth: keys.authB64,
});

beforeAll(async () => {
  server = await startFakePushServer();
  const pair = webpush.generateVAPIDKeys();
  vapid = {
    publicKey: pair.publicKey,
    privateKey: pair.privateKey,
    subject: "mailto:teste@citynews.local",
  };
  sender = createWebPushSender(vapid, {
    resolve: fakeResolve({}),
    testHosts: [server.host],
    timeoutMs: 3000,
  });
});
afterAll(() => server.close());

describe("createWebPushSender", () => {
  it("201 aceito; payload decifrado só com v,t,b,u,g,s; cabeçalhos TTL, Urgency e Topic", async () => {
    expect(await sender.send(sub("/ok"), payload, pushHeaders("urgent", TAG))).toEqual({
      kind: "accepted",
    });
    const r = server.received.at(-1)!;
    expect(r.path).toBe("/ok");
    expect(r.headers).toMatchObject({
      ttl: "7200",
      urgency: "high",
      topic: TAG,
      "content-encoding": "aes128gcm",
    });
    expect(r.headers.authorization).toMatch(/^vapid t=.+, k=/);
    const plain = (await server.decrypt(r.body, {
      privateKey: keys.privateKey,
      auth: keys.auth,
    })) as Record<string, unknown>;
    expect(Object.keys(plain).sort()).toEqual(["b", "g", "s", "t", "u", "v"]);
    expect(plain).toMatchObject({
      v: 1,
      t: "Chuva forte",
      b: "ORIGINAL CITYNEWS · Defesa Civil alerta",
      u: "/materia/chuva",
      s: SEND,
    });
    expect(r.body.length).toBeLessThanOrEqual(1024 + 200);
  });

  it("404 e 410 → gone; 429 com Retry-After → retry; 500 → retry; 403 → failed vapidInvalid; 413 → failed", async () => {
    server.respond("/gone404", 404);
    server.respond("/gone410", 410);
    server.respond("/busy", 429, { "retry-after": "900" });
    server.respond("/down", 500);
    server.respond("/badkey", 403);
    server.respond("/big", 413);
    const h = pushHeaders("follow", TAG);
    expect(await sender.send(sub("/gone404"), payload, h)).toEqual({ kind: "gone", status: 404 });
    expect(await sender.send(sub("/gone410"), payload, h)).toEqual({ kind: "gone", status: 410 });
    expect(await sender.send(sub("/busy"), payload, h)).toEqual({
      kind: "retry",
      status: 429,
      retryAfterSec: 900,
    });
    expect(await sender.send(sub("/down"), payload, h)).toEqual({
      kind: "retry",
      status: 500,
      retryAfterSec: null,
    });
    expect(await sender.send(sub("/badkey"), payload, h)).toEqual({
      kind: "failed",
      status: 403,
      vapidInvalid: true,
    });
    expect(await sender.send(sub("/big"), payload, h)).toEqual({
      kind: "failed",
      status: 413,
      vapidInvalid: false,
    });
  });

  it("host permitido resolvendo para IP privado no envio → failed sem requisição (Review Focus 4)", async () => {
    const before = server.received.length;
    const strict = createWebPushSender(vapid, {
      resolve: fakeResolve({ "fcm.googleapis.com": ["10.0.0.5"] }),
      testHosts: [],
    });
    expect(
      await strict.send(
        {
          endpoint: "https://fcm.googleapis.com/fcm/send/x",
          p256dh: keys.p256dh,
          auth: keys.authB64,
        },
        payload,
        pushHeaders("urgent", TAG),
      ),
    ).toEqual({ kind: "failed", status: 400, vapidInvalid: false });
    // Fora dos hosts de teste, o servidor falso (http, 127.0.0.1) também é recusado antes da rede.
    expect(await strict.send(sub("/ok"), payload, pushHeaders("urgent", TAG))).toEqual({
      kind: "failed",
      status: 400,
      vapidInvalid: false,
    });
    expect(server.received.length).toBe(before);
  });

  it("servidor sem resposta → retry (tempo limite)", async () => {
    const slow = createWebPushSender(vapid, {
      resolve: fakeResolve({}),
      testHosts: [server.host],
      timeoutMs: 200,
      fetch: () =>
        new Promise((_, reject) => setTimeout(() => reject(new Error("TimeoutError")), 250)),
    });
    expect(await slow.send(sub("/slow"), payload, pushHeaders("urgent", TAG))).toEqual({
      kind: "retry",
      status: null,
      retryAfterSec: null,
    });
  });
});
