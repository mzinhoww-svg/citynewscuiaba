/**
 * Service worker (public/sw.js, gerado de src/sw): API do cliente. Leitura offline das salvas
 * (P17), das lidas e das páginas (spec 2026-09-28 §8), toque em alerta (P18) e push.
 * Registrado em toda página pública depois do `load` e em ocioso (D-P11), nunca em /estudio.
 * Nunca lança.
 */
import type { OfflineListing, SwInbound } from "@/sw/contract";
import { browserFamily, deviceClass } from "@/lib/push/ua";

export const MAX_OFFLINE_SAVED = 20;
const ASK_TIMEOUT_MS = 1500;

export async function registerSw(): Promise<ServiceWorkerRegistration | null> {
  try {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
    await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    return await navigator.serviceWorker.ready;
  } catch {
    return null;
  }
}

/** Nunca no Estúdio: o SW ignora essas páginas de qualquer jeito, mas nem é registrado lá. */
export function swAllowedOn(pathname: string): boolean {
  return !/^\/estudio(\/|$)/.test(pathname);
}

type Idle = (cb: () => void) => void;

/**
 * Registra o SW sem competir com a página: depois do `load`, em `requestIdleCallback` (ou 2 s).
 * Devolve `false` quando o caminho não permite.
 */
export function registerSwOnIdle(
  pathname: string,
  deps: { idle?: Idle; win?: Window } = {},
): boolean {
  if (!swAllowedOn(pathname)) return false;
  if (typeof window === "undefined") return false;
  const win = deps.win ?? window;
  const idle: Idle =
    deps.idle ??
    ((cb) => {
      const ric = (
        win as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void }
      ).requestIdleCallback;
      if (typeof ric === "function") ric(cb, { timeout: 2000 });
      else win.setTimeout(cb, 2000);
    });
  const go = () => idle(() => void registerSw());
  if (win.document.readyState === "complete") go();
  else win.addEventListener("load", go, { once: true });
  return true;
}

/** Pergunta ao SW ativo por `MessageChannel`; sem SW ou sem resposta a tempo, `null`. */
export function askSw<T>(msg: SwInbound, timeoutMs = ASK_TIMEOUT_MS): Promise<T | null> {
  return new Promise((resolve) => {
    try {
      if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return resolve(null);
      const sw = navigator.serviceWorker.controller;
      if (!sw) return resolve(null);
      const channel = new MessageChannel();
      const timer = setTimeout(() => resolve(null), timeoutMs);
      channel.port1.onmessage = (e) => {
        clearTimeout(timer);
        resolve((e.data as T) ?? null);
      };
      sw.postMessage(msg, [channel.port2]);
    } catch {
      resolve(null);
    }
  });
}

/** Quando a página atual foi servida do cache (spec §7.8), ou `null` se veio da rede. */
export async function queryCachedAt(url: string): Promise<string | null> {
  const r = await askSw<{ cachedAt: string | null }>({ type: "served-from-cache", url });
  return r?.cachedAt ?? null;
}

export async function listOffline(): Promise<OfflineListing | null> {
  return askSw<OfflineListing>({ type: "list-offline" });
}

/** Apaga `cn-lidas` e `cn-paginas` (P21/P22 e "Limpar leitura offline"); salvas ficam. */
export async function clearOffline(): Promise<boolean> {
  const r = await askSw<{ cleared: true }>({ type: "clear-offline" }, 5000);
  return r?.cleared === true;
}

/** Consentimento de métricas para o SW (recibo só com Métricas, D-P21), com aparelho e navegador. */
export async function sendConsentToSw(c: { metrics: boolean }): Promise<void> {
  try {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const ua = navigator.userAgent ?? "";
    const msg: SwInbound = {
      type: "consent",
      metrics: c.metrics,
      device: deviceClass(ua),
      browser: browserFamily(ua),
    };
    const controller = navigator.serviceWorker.controller;
    if (controller) {
      controller.postMessage(msg);
      return;
    }
    const reg = await navigator.serviceWorker.ready;
    reg.active?.postMessage(msg);
  } catch {
    /* sem SW */
  }
}

/** Pede ao service worker para guardar as páginas das salvas mais recentes. */
export async function cacheSaved(paths: string[]): Promise<void> {
  const reg = await registerSw();
  reg?.active?.postMessage({ type: "cache-saved", paths: paths.slice(0, MAX_OFFLINE_SAVED) });
}

/** Mostra um aviso pelo service worker (abre a página ao tocar) ou, sem ele, pela API direta. */
export async function showNotification(
  title: string,
  opts: { body: string; href: string; tag: string },
): Promise<boolean> {
  try {
    // Sem permissão, o navegador recusa e o erro é engolido abaixo.
    if (typeof Notification === "undefined") return false;
    const reg = await registerSw();
    const options = {
      body: opts.body,
      tag: opts.tag,
      data: { href: opts.href, url: opts.href },
      icon: "/icons/icon-192.png",
      badge: "/icons/badge-72.png",
      lang: "pt-BR",
    };
    if (reg) await reg.showNotification(title, options);
    else new Notification(title, options);
    return true;
  } catch {
    return false;
  }
}
