/**
 * Instalação (spec 2026-09-28 §7.2, §7.9, §7.10): captura do `beforeinstallprompt`, `prompt()`,
 * detecção de `standalone`, plataforma do convite e a primeira abertura instalada
 * (`?origem=app`, removido da URL sem registrar parâmetro de rastreio).
 */
import { markInstalled } from "./invites";
import { readAppState, writeAppState } from "./storage";

export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
let captured = false;
const listeners = new Set<() => void>();

/** Guarda o evento (uma vez por página) para o `prompt()` sair só no gesto do leitor. */
export function captureInstallPrompt(): void {
  if (captured || typeof window === "undefined") return;
  captured = true;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    for (const l of listeners) l();
  });
}

export function onInstallPromptAvailable(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function installPromptAvailable(): boolean {
  return deferred !== null;
}

/** Para `useSyncExternalStore`: assina a disponibilidade do prompt. */
export function subscribeInstallPrompt(cb: () => void): () => void {
  return onInstallPromptAvailable(cb);
}
export const noPromptOnServer = (): boolean => false;

export async function promptInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  const ev = deferred;
  if (!ev) return "unavailable";
  try {
    await ev.prompt();
    const { outcome } = await ev.userChoice;
    if (outcome === "accepted") deferred = null;
    return outcome;
  } catch {
    return "unavailable";
  }
}

export function isStandalone(): boolean {
  try {
    if (window.matchMedia?.("(display-mode: standalone)").matches) return true;
    return (navigator as Navigator & { standalone?: boolean }).standalone === true;
  } catch {
    return false;
  }
}

export function isIos(
  ua: string = navigator.userAgent,
  maxTouchPoints = navigator.maxTouchPoints,
): boolean {
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1);
}

/** Safari no iPhone/iPad: WebKit sem Chrome/CriOS/FxiOS/EdgiOS (Chrome iOS mostra outro passo 1). */
export function isIosSafari(
  ua: string = navigator.userAgent,
  maxTouchPoints = navigator.maxTouchPoints,
): boolean {
  return isIos(ua, maxTouchPoints) && !/CriOS|FxiOS|EdgiOS|OPT\/|Chrome/.test(ua);
}

export type InvitePlatform = "android" | "ios" | "desktop";

export function platformForInvite(
  ua: string = navigator.userAgent,
  maxTouchPoints = navigator.maxTouchPoints,
): InvitePlatform {
  if (isIos(ua, maxTouchPoints)) return "ios";
  if (/Android/.test(ua)) return "android";
  return "desktop";
}

export type InstalledVia = "prompt" | "ios_steps" | "browser" | "unknown";

/**
 * Primeira abertura em `standalone` com `?origem=app`: marca instalado, registra `app_installed`
 * (`via` conforme o que o navegador lembra) e tira o parâmetro da URL. Devolve o `via` ou `null`.
 */
export function handleFirstStandaloneOpen(track: (via: InstalledVia) => void): InstalledVia | null {
  try {
    const url = new URL(location.href);
    if (url.searchParams.get("origem") !== "app") return null;
    url.searchParams.delete("origem");
    history.replaceState(history.state, "", `${url.pathname}${url.search}${url.hash}`);
    if (!isStandalone()) return null;
    const s = readAppState();
    if (!s || s.install.installed) return null;
    const via: InstalledVia = s.install.stepsShown ? "ios_steps" : isIos() ? "browser" : "unknown";
    writeAppState(markInstalled(s));
    track(via);
    return via;
  } catch {
    return null;
  }
}

/** Só para testes: esquece o evento capturado. */
export function resetInstallPromptForTests(): void {
  deferred = null;
  captured = false;
  listeners.clear();
}
