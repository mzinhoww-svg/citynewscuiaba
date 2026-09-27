import { createStore, del, get, set } from "idb-keyval";
import type { AnonProfile, AnonStore, DismissReason, FollowKind, KV, ReadEntry } from "./types";

export type { AnonProfile, AnonStore, DismissReason, FollowKind, KV } from "./types";

/** Retenção local (spec §5.3). */
export const HISTORY_DAYS = 30;
export const MAX_SEARCHES = 20;
const MAX_SAVED = 500;
const MAX_FOLLOWS = 500;
const MAX_HIDDEN = 500;
const MAX_HISTORY = 1000;
const KEY = "profile";
const DAY_MS = 86_400_000;

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FOLLOW_KINDS: readonly FollowKind[] = ["source", "topic", "section", "collection"];
const REASONS: readonly DismissReason[] = [
  "not_interested",
  "already_know",
  "hide_topic",
  "no_personalization",
];

export function memoryKV(): KV {
  const m = new Map<string, unknown>();
  return {
    get: async (k) => structuredClone(m.get(k)),
    set: async (k, v) => void m.set(k, structuredClone(v)),
    del: async (k) => void m.delete(k),
  };
}

/** IndexedDB (banco `citynews`, tabela `anon`) via idb-keyval. */
export function idbKV(): KV {
  const store = createStore("citynews", "anon");
  return {
    get: (k) => get(k, store),
    set: (k, v) => set(k, v, store),
    del: (k) => del(k, store),
  };
}

// --- normalização: o que está no navegador pode ser antigo, corrompido ou editado à mão ---

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const str = (v: unknown, max = 300): string | null =>
  typeof v === "string" && v.length > 0 && v.length <= max ? v : null;
const num = (v: unknown, min: number, max: number): number =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : min;
const iso = (v: unknown): string | null =>
  typeof v === "string" && !Number.isNaN(Date.parse(v)) ? v : null;
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

function emptyProfile(now: Date): AnonProfile {
  return {
    anonId: null,
    createdAt: now.toISOString(),
    follows: [],
    saved: [],
    history: [],
    searches: [],
    interests: [],
    hidden: [],
  };
}

export function normalizeProfile(raw: unknown, now: Date): AnonProfile {
  if (!isObj(raw)) return emptyProfile(now);
  const anonId = typeof raw.anonId === "string" && UUID_V4.test(raw.anonId) ? raw.anonId : null;
  const follows = arr(raw.follows).flatMap((f) => {
    if (!isObj(f)) return [];
    const kind = FOLLOW_KINDS.find((k) => k === f.kind);
    const id = str(f.id);
    const at = iso(f.at);
    return kind && id && at ? [{ kind, id, at }] : [];
  });
  const saved = arr(raw.saved).flatMap((x) => {
    if (!isObj(x)) return [];
    const ref = str(x.ref);
    const at = iso(x.at);
    return ref && at ? [{ ref, at, progress: num(x.progress, 0, 100) }] : [];
  });
  const history = arr(raw.history).flatMap((h) => {
    if (!isObj(h)) return [];
    const ref = str(h.ref);
    const at = iso(h.at);
    if (!ref || !at) return [];
    const sourceSlug = str(h.sourceSlug, 120);
    const section = str(h.section, 120);
    return [
      {
        ref,
        at,
        seconds: num(h.seconds, 0, 86_400),
        scrollPct: num(h.scrollPct, 0, 100),
        ...(sourceSlug ? { sourceSlug } : {}),
        ...(section ? { section } : {}),
      },
    ];
  });
  const searches = arr(raw.searches).flatMap((q) => {
    const s = str(q, 200);
    return s ? [s] : [];
  });
  const interests = arr(raw.interests).flatMap((i) => {
    if (!isObj(i)) return [];
    const key = str(i.key, 120);
    const evidence = str(i.evidence);
    return key && evidence ? [{ key, evidence, weak: i.weak === true }] : [];
  });
  const hidden = arr(raw.hidden).flatMap((h) => {
    if (!isObj(h)) return [];
    const sourceSlug = str(h.sourceSlug, 120);
    const reason = REASONS.find((r) => r === h.reason);
    const at = iso(h.at);
    return sourceSlug && reason && at ? [{ sourceSlug, reason, at }] : [];
  });
  const tracking = anonId !== null;
  return prune(
    {
      anonId,
      createdAt: iso(raw.createdAt) ?? now.toISOString(),
      follows,
      saved,
      // Sem anonId (sem Personalização) não há histórico, buscas nem interesses.
      history: tracking ? history : [],
      searches: tracking ? searches : [],
      interests: tracking ? interests : [],
      hidden,
    },
    now,
  );
}

/** Aplica a retenção: histórico de 30 dias, 20 buscas e tetos de tamanho. */
function prune(p: AnonProfile, now: Date): AnonProfile {
  const cutoff = now.getTime() - HISTORY_DAYS * DAY_MS;
  return {
    ...p,
    follows: p.follows.slice(0, MAX_FOLLOWS),
    saved: p.saved.slice(0, MAX_SAVED),
    history: p.history.filter((h) => Date.parse(h.at) >= cutoff).slice(0, MAX_HISTORY),
    searches: p.searches.slice(0, MAX_SEARCHES),
    hidden: p.hidden.slice(0, MAX_HIDDEN),
  };
}

function withoutTracking(p: AnonProfile): AnonProfile {
  return { ...p, anonId: null, history: [], searches: [], interests: [] };
}

export interface AnonStoreOptions {
  now?: () => Date;
  uuid?: () => string;
}

/**
 * Perfil anônimo com escrita em série (sem perder alterações simultâneas). Se o backend
 * falhar (modo privado antigo, cota cheia), continua em memória e marca `degraded`.
 */
export function createAnonStore(backend?: KV, opts: AnonStoreOptions = {}): AnonStore {
  const now = opts.now ?? (() => new Date());
  const uuid = opts.uuid ?? (() => crypto.randomUUID());
  let kv: KV = backend ?? memoryKV();
  let degraded = false;
  let last: AnonProfile | null = null;
  let chain: Promise<unknown> = Promise.resolve();

  const degrade = async (keep: AnonProfile | null) => {
    degraded = true;
    kv = memoryKV();
    if (keep) await kv.set(KEY, keep);
  };

  const load = async (): Promise<AnonProfile> => {
    try {
      last = normalizeProfile(await kv.get(KEY), now());
    } catch {
      await degrade(last);
      last = normalizeProfile(await kv.get(KEY), now());
    }
    return last;
  };

  const persist = async (p: AnonProfile) => {
    last = p;
    try {
      await kv.set(KEY, p);
    } catch {
      await degrade(p);
    }
  };

  /** Lê, altera e grava em série. */
  const mutate = <T>(fn: (p: AnonProfile) => [AnonProfile, T]): Promise<T> => {
    const run = chain.then(async () => {
      const [next, out] = fn(await load());
      await persist(prune(next, now()));
      return out;
    });
    chain = run.catch(() => undefined);
    return run;
  };
  const change = (fn: (p: AnonProfile) => AnonProfile) =>
    mutate((p) => [fn(p), undefined] as [AnonProfile, undefined]);

  const stamp = () => now().toISOString();

  return {
    get degraded() {
      return degraded;
    },
    get: () => {
      const run = chain.then(load);
      chain = run.catch(() => undefined);
      return run;
    },
    follow: (kind, id) =>
      change((p) =>
        p.follows.some((f) => f.kind === kind && f.id === id)
          ? p
          : { ...p, follows: [{ kind, id, at: stamp() }, ...p.follows] },
      ),
    unfollow: (kind, id) =>
      change((p) => ({
        ...p,
        follows: p.follows.filter((f) => !(f.kind === kind && f.id === id)),
      })),
    save: (ref, progress = 0) =>
      change((p) =>
        p.saved.some((s) => s.ref === ref)
          ? p
          : { ...p, saved: [{ ref, at: stamp(), progress: num(progress, 0, 100) }, ...p.saved] },
      ),
    unsave: (ref) => change((p) => ({ ...p, saved: p.saved.filter((s) => s.ref !== ref) })),
    recordRead: (entry) =>
      change((p) =>
        p.anonId === null
          ? p
          : {
              ...p,
              history: [
                {
                  ...entry,
                  at: entry.at ?? stamp(),
                  seconds: num(entry.seconds, 0, 86_400),
                  scrollPct: num(entry.scrollPct, 0, 100),
                },
                ...p.history,
              ],
            },
      ),
    recordSearch: (query) =>
      change((p) => {
        const q = query.trim().slice(0, 200);
        if (p.anonId === null || !q) return p;
        return { ...p, searches: [q, ...p.searches.filter((s) => s !== q)] };
      }),
    hide: (sourceSlug, reason) =>
      change((p) => ({
        ...p,
        hidden: [
          { sourceSlug, reason, at: stamp() },
          ...p.hidden.filter((h) => h.sourceSlug !== sourceSlug),
        ],
      })),
    unhide: (sourceSlug) =>
      change((p) => ({ ...p, hidden: p.hidden.filter((h) => h.sourceSlug !== sourceSlug) })),
    clearHistory: () => change((p) => ({ ...p, history: [], searches: [], interests: [] })),
    reset: () => change(() => emptyProfile(now())),
    ensureAnonId: (consent) =>
      mutate((p) => {
        if (!consent.personalization) {
          const next = p.anonId === null ? p : withoutTracking(p);
          return [next, null];
        }
        if (p.anonId) return [p, p.anonId];
        const anonId = uuid();
        return [{ ...p, anonId }, anonId];
      }),
  };
}

let shared: AnonStore | null = null;

/**
 * Perfil deste navegador (um por aba). Usa IndexedDB quando existe; sem ele, memória com
 * `degraded` (aviso "Não conseguimos salvar neste navegador").
 */
export function getAnonStore(): AnonStore {
  if (shared) return shared;
  const hasIdb = typeof indexedDB !== "undefined";
  shared = createAnonStore(hasIdb ? idbKV() : failingBackend());
  return shared;
}

function failingBackend(): KV {
  const fail = () => Promise.reject(new Error("IndexedDB indisponível"));
  return { get: fail, set: fail, del: fail };
}

export type { ReadEntry };
