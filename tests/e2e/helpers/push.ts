/**
 * Apoio dos e2e de PWA e push (PW-T15): service worker pronto, entrega de push pelo CDP
 * (`ServiceWorker.deliverPushMessage`), avisos mostrados, inscrição falsa no navegador e o
 * despacho pelo `drain` com o `CRON_SECRET`. Só Chromium.
 */
import { expect, type Page } from "@playwright/test";
import type { PushPayload } from "@/lib/push/types";
import { cronSecret, drain, serviceClient } from "./pipeline";

/** Espera o SW controlar a página (registro depois do load e em ocioso). */
export async function swReady(page: Page): Promise<void> {
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker?.controller)), {
      timeout: 20_000,
    })
    .toBe(true);
}

type SwRegistration = { registrationId: string; scopeURL: string; isDeleted: boolean };
type SwVersion = { registrationId: string; status: string; controlledClients?: string[] };

/**
 * Entrega um push ao SW que controla a página (CDP). O `ServiceWorker.enable` emite os registros
 * e versões atuais; na rodada completa ainda aparecem registros de contextos recém-fechados da
 * mesma origem (mesmo worker), então o alvo é o registro cuja versão ativa controla um cliente
 * e, na falta dele, o registro mais novo que não foi apagado.
 */
export async function deliverPush(page: Page, payload: PushPayload | string): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  const origin = new URL(page.url()).origin;
  const regs = new Map<string, SwRegistration>();
  const versions = new Map<string, SwVersion>();
  cdp.on("ServiceWorker.workerRegistrationUpdated", (e) => {
    for (const r of e.registrations as SwRegistration[])
      if (r.scopeURL.startsWith(origin)) regs.set(r.registrationId, r);
  });
  cdp.on("ServiceWorker.workerVersionUpdated", (e) => {
    for (const v of e.versions as (SwVersion & { versionId: string })[])
      versions.set(v.versionId, v);
  });
  await cdp.send("ServiceWorker.enable");
  const alive = () => [...regs.values()].filter((r) => !r.isDeleted);
  const controlling = () =>
    [...versions.values()].find(
      (v) =>
        v.status === "activated" &&
        (v.controlledClients?.length ?? 0) > 0 &&
        alive().some((r) => r.registrationId === v.registrationId),
    )?.registrationId ?? null;
  const newest = () =>
    alive()
      .map((r) => r.registrationId)
      .sort((a, b) => Number(b) - Number(a))[0] ?? null;
  let registrationId: string | null = null;
  const start = Date.now();
  while (Date.now() - start < 10_000) {
    await new Promise((r) => setTimeout(r, 100));
    registrationId = controlling();
    if (registrationId) break;
    // Um registro só: é o da página. Mais de um: espera as versões por até 2 s antes do mais novo.
    if (alive().length === 1 || (alive().length > 1 && Date.now() - start > 2_000)) {
      registrationId = newest();
      break;
    }
  }
  if (!registrationId) {
    await cdp.detach();
    throw new Error("SW sem registro");
  }
  await cdp.send("ServiceWorker.deliverPushMessage", {
    origin,
    registrationId,
    data: typeof payload === "string" ? payload : JSON.stringify(payload),
  });
  await cdp.detach();
}

/** Avisos abertos no registro do SW (`registration.getNotifications()`). */
export async function shownNotifications(
  page: Page,
): Promise<{ title: string; body: string; data: unknown }[]> {
  return page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    const list = await reg.getNotifications();
    return list.map((n) => ({ title: n.title, body: n.body, data: n.data as unknown }));
  });
}

/**
 * Inscrição falsa no navegador: `PushManager.prototype.subscribe`/`getSubscription` devolvem um
 * endpoint do servidor de push falso; a permissão só vira "granted" depois do pedido nativo
 * (como num navegador de verdade). Inscrição e permissão sobrevivem à navegação (sessionStorage).
 */
export function stubPushManager(page: Page, endpoint: string) {
  return page.addInitScript(
    ({ endpoint }) => {
      const b64 = (n: number) => {
        const bytes = new Uint8Array(n);
        crypto.getRandomValues(bytes);
        return btoa(String.fromCharCode(...bytes))
          .replace(/\+/g, "-")
          .replace(/\//g, "_")
          .replace(/=+$/, "");
      };
      const SUB = "__cnStubSub";
      const PERM = "__cnStubPerm";
      const stored = sessionStorage.getItem(SUB);
      let keys: { p256dh: string; auth: string } | null = stored ? JSON.parse(stored) : null;
      // Par ECDH P-256 de verdade: o `web-push` cifra o payload com a pública (aes128gcm) e
      // recusa um ponto inválido; o servidor falso não decifra, então a privada é descartada.
      const makeKeys = async () => {
        const pair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
          "deriveBits",
        ]);
        const raw = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
        const b64u = (bytes: Uint8Array) =>
          btoa(String.fromCharCode(...bytes))
            .replace(/\+/g, "-")
            .replace(/\//g, "_")
            .replace(/=+$/, "");
        return { p256dh: b64u(raw), auth: b64(16) };
      };
      const make = (k: { p256dh: string; auth: string }) =>
        ({
          endpoint,
          options: { userVisibleOnly: true, applicationServerKey: null },
          expirationTime: null,
          getKey: () => null,
          toJSON: () => ({ endpoint, keys: k }),
          unsubscribe: async () => {
            current = null;
            sessionStorage.removeItem(SUB);
            return true;
          },
        }) as unknown as PushSubscription;
      let current: PushSubscription | null = keys ? make(keys) : null;
      PushManager.prototype.subscribe = async function () {
        if (!current) {
          keys ??= await makeKeys();
          current = make(keys);
        }
        sessionStorage.setItem(SUB, JSON.stringify(keys));
        return current;
      };
      PushManager.prototype.getSubscription = async function () {
        return current;
      };
      let permission = (sessionStorage.getItem(PERM) ?? "default") as NotificationPermission;
      Object.defineProperty(Notification, "permission", {
        get: () => permission,
        configurable: true,
      });
      const orig = Notification.requestPermission.bind(Notification);
      Notification.requestPermission = (async () => {
        permission = await orig();
        sessionStorage.setItem(PERM, permission);
        return permission;
      }) as typeof Notification.requestPermission;
    },
    { endpoint },
  );
}

/** Roda o `drain` (com `push_dispatch_due` antes) no servidor alvo. */
export async function drainAndDispatch(baseURL: string) {
  const r = await drain(baseURL, cronSecret());
  if (r.status !== 200) throw new Error(`drain: ${r.status} ${JSON.stringify(r.body)}`);
  return r.body;
}

/** Contadores agregados de um envio (recebidos/tocados), somados por aparelho e navegador. */
export async function counters(sendId: string): Promise<{ delivered: number; clicked: number }> {
  const { data, error } = await serviceClient()
    .from("push_send_counters")
    .select("delivered, clicked")
    .eq("send_id", sendId);
  if (error) throw new Error(error.message);
  return (data ?? []).reduce(
    (acc, r) => ({ delivered: acc.delivered + r.delivered, clicked: acc.clicked + r.clicked }),
    { delivered: 0, clicked: 0 },
  );
}

export function fakePushBase(): string {
  return `http://127.0.0.1:${process.env.CN_FAKE_PUSH_PORT}`;
}

/** O que o servidor de push falso recebeu (`GET /__received`). */
export async function receivedByFakeServer(): Promise<{ path: string; bytes: number }[]> {
  const res = await fetch(`${fakePushBase()}/__received`);
  return (await res.json()) as { path: string; bytes: number }[];
}
