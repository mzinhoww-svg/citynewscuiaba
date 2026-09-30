"use client";

/**
 * Push no navegador (spec 2026-09-28 §7.4, §7.5, §15; D-P12, D-P13, D-P25). Tudo sem login:
 * a inscrição leva só os alvos explícitos (`targetsFromProfile`), nunca histórico, interesses
 * ou `anonId`. Credenciais (`id`, `token`, chave pública) ficam no IndexedDB `cn-sw` (G18).
 * `enablePush` só roda em gesto do leitor (exigência do Safari).
 */
import { useSyncExternalStore } from "react";
import { getAnonStore } from "@/lib/anon/store";
import { isIos, isStandalone } from "@/lib/app/install";
import { readConsentCookie } from "@/lib/consent";
import { trackWithConsent } from "@/lib/events/send";
import { registerSw, sendConsentToSw } from "@/lib/offline/sw";
import { err, ok, type Result } from "@/lib/result";
import { delMeta, getMeta, setMeta } from "@/sw/shared-db";
import { VAPID_PUBLIC_KEY } from "./public";
import type { PushPrefs } from "./schemas";
import { targetsFromProfile } from "./targets";
import type { TargetKey } from "./types";

export type { PushPrefs } from "./schemas";

export type PushSupport =
  "unsupported" | "no_keys" | "ios_needs_install" | "default" | "denied" | "granted";

export type PushState =
  | { status: "unknown" }
  | { status: "off" }
  | { status: "on"; id: string; prefs: PushPrefs; targets: TargetKey[] }
  | { status: "lost" };

export type NotifTrigger = "follow" | "alert" | "urgent_article" | "settings";
export type EnableError = "denied" | "subscribe_failed" | "server_failed" | "rate_limited";

export const DEFAULT_PREFS: PushPrefs = {
  follow: true,
  urgent: true,
  highlight: true,
  quietStart: 22,
  quietEnd: 7,
  dailyLimit: 3,
};

type Meta = {
  id: string;
  token: string;
  publicKey: string;
  prefs?: PushPrefs;
  targets?: TargetKey[];
};

// ---------------------------------------------------------------------------
// Store externo do estado (useSyncExternalStore)
// ---------------------------------------------------------------------------
let state: PushState = { status: "unknown" };
const subs = new Set<() => void>();
function setState(next: PushState) {
  state = next;
  for (const s of subs) s();
}
const subscribe = (cb: () => void) => {
  subs.add(cb);
  return () => {
    subs.delete(cb);
  };
};
const UNKNOWN: PushState = { status: "unknown" };

export function usePushState(): PushState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => UNKNOWN,
  );
}
export function currentPushState(): PushState {
  return state;
}
export function resetPushStateForTests(): void {
  state = { status: "unknown" };
}

// ---------------------------------------------------------------------------
// Suporte
// ---------------------------------------------------------------------------
export function pushSupport(): PushSupport {
  if (typeof window === "undefined") return "unsupported";
  if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window))
    return "unsupported";
  if (!VAPID_PUBLIC_KEY) return "no_keys";
  if (isIos() && !isStandalone()) return "ios_needs_install";
  const p = Notification.permission;
  return p === "granted" ? "granted" : p === "denied" ? "denied" : "default";
}

function keyBytes(key: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (key.length % 4)) % 4);
  const raw = atob((key + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function currentTargets(): Promise<TargetKey[]> {
  try {
    return targetsFromProfile(await getAnonStore().get());
  } catch {
    return [];
  }
}

function consent() {
  try {
    return readConsentCookie(document.cookie);
  } catch {
    return readConsentCookie("");
  }
}

async function api(
  path: string,
  method: string,
  body: unknown,
  token?: string,
): Promise<Response | null> {
  try {
    return await fetch(path, {
      method,
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? null : JSON.stringify(body),
    });
  } catch {
    return null;
  }
}

async function browserSubscription(): Promise<PushSubscription | null> {
  try {
    const reg = await registerSw();
    return (await reg?.pushManager.getSubscription()) ?? null;
  } catch {
    return null;
  }
}

function onState(meta: Meta): PushState {
  return {
    status: "on",
    id: meta.id,
    prefs: meta.prefs ?? DEFAULT_PREFS,
    targets: meta.targets ?? [],
  };
}

// ---------------------------------------------------------------------------
// Ativar / desativar / ajustar / sincronizar
// ---------------------------------------------------------------------------
export async function enablePush(trigger: NotifTrigger): Promise<Result<PushState, EnableError>> {
  const support = pushSupport();
  if (support === "denied") return err("denied");
  if (support !== "default" && support !== "granted") return err("subscribe_failed");
  const c = consent();
  let permission: NotificationPermission;
  try {
    permission = await Notification.requestPermission();
  } catch {
    permission = "denied";
  }
  if (permission !== "granted") {
    void trackWithConsent(c, "notif_permission_denied", { trigger });
    return err("denied");
  }
  void trackWithConsent(c, "notif_permission_granted", { trigger });

  const reg = await registerSw();
  if (!reg || !VAPID_PUBLIC_KEY) return err("subscribe_failed");
  let sub: PushSubscription;
  try {
    sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: keyBytes(VAPID_PUBLIC_KEY),
      }));
  } catch {
    return err("subscribe_failed");
  }
  const json = sub.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) {
    await sub.unsubscribe().catch(() => undefined);
    return err("subscribe_failed");
  }
  const old = await getMeta("push");
  const targets = await currentTargets();
  const body = {
    endpoint: json.endpoint,
    keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
    targets,
    installed: isStandalone(),
    metricsConsent: c.decided && c.metrics,
    ...(old?.token ? { oldToken: old.token } : {}),
  };
  let res = await api("/api/push/subscriptions", "POST", body);
  if (res?.status === 409) {
    // Endpoint conhecido sem prova de posse: refaz a inscrição no navegador (spec §13).
    await sub.unsubscribe().catch(() => undefined);
    await delMeta("push");
    try {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: keyBytes(VAPID_PUBLIC_KEY),
      });
    } catch {
      return err("subscribe_failed");
    }
    const j = sub.toJSON();
    res = await api("/api/push/subscriptions", "POST", {
      ...body,
      endpoint: j.endpoint,
      keys: { p256dh: j.keys?.p256dh, auth: j.keys?.auth },
      oldToken: undefined,
    });
  }
  if (!res || !res.ok) {
    // Não deixa inscrição órfã no navegador (spec §15).
    await sub.unsubscribe().catch(() => undefined);
    return err(res?.status === 429 ? "rate_limited" : "server_failed");
  }
  const { id, token } = (await res.json()) as { id: string; token: string };
  const meta: Meta = { id, token, publicKey: VAPID_PUBLIC_KEY, prefs: DEFAULT_PREFS, targets };
  await setMeta("push", meta);
  void sendConsentToSw({ metrics: c.decided && c.metrics });
  const next = onState(meta);
  setState(next);
  return ok(next);
}

export async function disablePush(): Promise<Result<void, "server_failed">> {
  const meta = await getMeta("push");
  const sub = await browserSubscription();
  let failed = false;
  if (meta) {
    const res = await api(`/api/push/subscriptions/${meta.id}`, "DELETE", undefined, meta.token);
    if (!res || (!res.ok && res.status !== 404)) failed = true;
  }
  await sub?.unsubscribe().catch(() => undefined);
  await delMeta("push");
  setState({ status: "off" });
  void trackWithConsent(consent(), "push_unsubscribed", { from: "settings" });
  return failed ? err("server_failed") : ok(undefined);
}

export async function updatePushPrefs(
  patch: Partial<PushPrefs>,
): Promise<Result<PushState, "server_failed" | "lost">> {
  const meta = await getMeta("push");
  if (!meta) return err("lost");
  const res = await api(
    `/api/push/subscriptions/${meta.id}`,
    "PATCH",
    { prefs: patch },
    meta.token,
  );
  if (res?.status === 404) {
    await delMeta("push");
    setState({ status: "lost" });
    return err("lost");
  }
  if (!res || !res.ok) return err("server_failed");
  const view = (await res.json()) as { prefs: PushPrefs; targets: TargetKey[] };
  const next: Meta = { ...meta, prefs: view.prefs, targets: view.targets };
  await setMeta("push", next);
  const s = onState(next);
  setState(s);
  return ok(s);
}

/**
 * No carregamento: alinha alvos, `metrics_consent` e `last_seen_at` com o servidor. Inscrição
 * no navegador sem token (IndexedDB apagado) → `unsubscribe()` e `lost`; 404 → `lost`.
 */
export async function syncPush(consentMetrics: boolean): Promise<PushState> {
  if (pushSupport() === "unsupported") {
    setState({ status: "off" });
    return state;
  }
  const meta = await getMeta("push");
  const sub = Notification.permission === "granted" ? await browserSubscription() : null;
  void sendConsentToSw({ metrics: consentMetrics });
  if (sub && !meta) {
    await sub.unsubscribe().catch(() => undefined);
    setState({ status: "lost" });
    return state;
  }
  if (!meta) {
    setState({ status: "off" });
    return state;
  }
  if (!sub) {
    await delMeta("push");
    setState({ status: "off" });
    return state;
  }
  const targets = await currentTargets();
  const res = await api(
    `/api/push/subscriptions/${meta.id}`,
    "PATCH",
    { targets, metricsConsent: consentMetrics, installed: isStandalone(), seen: true },
    meta.token,
  );
  if (res?.status === 404) {
    await delMeta("push");
    await sub.unsubscribe().catch(() => undefined);
    setState({ status: "lost" });
    return state;
  }
  if (res?.ok) {
    const view = (await res.json()) as { prefs: PushPrefs; targets: TargetKey[] };
    const next: Meta = { ...meta, prefs: view.prefs, targets: view.targets };
    await setMeta("push", next);
    setState(onState(next));
    return state;
  }
  // Servidor fora: mantém o que o navegador lembra.
  setState(onState({ ...meta, targets: meta.targets ?? targets }));
  return state;
}
