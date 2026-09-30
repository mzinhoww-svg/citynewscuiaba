/**
 * Estado dos convites do app (`cn_app` no localStorage, `cn_app_tab` no sessionStorage), em
 * `try/catch`. Sem armazenamento, `readAppState()` devolve `null` e nenhum convite aparece:
 * não dá para respeitar a recusa (spec §7.1).
 */
import { EMPTY_APP_STATE, type AppState } from "./invites";

export const APP_KEY = "cn_app";
export const TAB_KEY = "cn_app_tab";

const num = (v: unknown): number =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0;
const iso = (v: unknown): string | null =>
  typeof v === "string" && Number.isFinite(Date.parse(v)) ? v : null;

export function parseAppState(raw: string | null): AppState {
  if (!raw) return { ...EMPTY_APP_STATE };
  try {
    const p = JSON.parse(raw) as Partial<AppState> | null;
    if (!p || typeof p !== "object") return { ...EMPTY_APP_STATE };
    return {
      visits: num(p.visits),
      reads: num(p.reads),
      install: {
        refusals: num(p.install?.refusals),
        silencedUntil: iso(p.install?.silencedUntil),
        installed: p.install?.installed === true,
        ...(p.install?.stepsShown ? { stepsShown: true } : {}),
      },
      notif: { refusals: num(p.notif?.refusals), silencedUntil: iso(p.notif?.silencedUntil) },
      lastVisitDay: typeof p.lastVisitDay === "string" ? p.lastVisitDay : null,
      lastVisitAt: iso(p.lastVisitAt),
    };
  } catch {
    return { ...EMPTY_APP_STATE };
  }
}

/** `null` sem localStorage utilizável. */
export function readAppState(): AppState | null {
  try {
    const raw = window.localStorage.getItem(APP_KEY);
    // Confere que dá para gravar: sem isso, a recusa não seria lembrada.
    window.localStorage.setItem(`${APP_KEY}_probe`, "1");
    window.localStorage.removeItem(`${APP_KEY}_probe`);
    return parseAppState(raw);
  } catch {
    return null;
  }
}

const listeners = new Set<() => void>();

export function writeAppState(s: AppState): void {
  try {
    window.localStorage.setItem(APP_KEY, JSON.stringify(s));
  } catch {
    /* sem armazenamento */
  }
  for (const l of listeners) l();
}

/** Sentinela de armazenamento indisponível (snapshot primitivo para `useSyncExternalStore`). */
export const NO_STORAGE = "\u0000";

/** Snapshot bruto (`string` do localStorage, `null` vazio, `NO_STORAGE` bloqueado). */
export function readAppRaw(): string | null {
  try {
    const raw = window.localStorage.getItem(APP_KEY);
    window.localStorage.setItem(`${APP_KEY}_probe`, "1");
    window.localStorage.removeItem(`${APP_KEY}_probe`);
    return raw;
  } catch {
    return NO_STORAGE;
  }
}

export function subscribeAppState(cb: () => void): () => void {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === APP_KEY) cb();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

export const appStateOnServer = (): string | null => NO_STORAGE;

/** `true` na primeira navegação desta aba (marca a sessão de aba). */
export function isNewTabSession(): boolean {
  try {
    if (window.sessionStorage.getItem(TAB_KEY)) return false;
    window.sessionStorage.setItem(TAB_KEY, "1");
    return true;
  } catch {
    return false;
  }
}
