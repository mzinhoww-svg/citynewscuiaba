/**
 * IndexedDB `cn-sw` (v1) compartilhado entre a página e o service worker (spec §8.3, G18):
 * store `entries` (índice do cache) e store `meta` (`consent`, `push`). Tudo em `try/catch`:
 * sem IndexedDB (modo privado, cota) as leituras devolvem `null` e as escritas não fazem nada.
 */
import type { BrowserFamily, DeviceClass, PushPrefs, TargetKey } from "@/lib/push/types";
import type { IndexEntry } from "./contract";

export const DB_NAME = "cn-sw";
export const DB_VERSION = 1;

export interface SwMeta {
  consent: { metrics: boolean; device: DeviceClass; browser: BrowserFamily };
  /** Credenciais da inscrição (G18) mais o que a página mostra em Alertas sem ir ao servidor. */
  push: { id: string; token: string; publicKey: string; prefs?: PushPrefs; targets?: TargetKey[] };
}

let dbPromise: Promise<IDBDatabase | null> | null = null;

function open(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("entries"))
          db.createObjectStore("entries", { keyPath: "url" });
        if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta");
      };
      req.onsuccess = () => {
        req.result.onversionchange = () => {
          req.result.close();
          dbPromise = null;
        };
        resolve(req.result);
      };
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

function run<T>(
  store: "entries" | "meta",
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T | null> {
  return open().then(
    (db) =>
      new Promise<T | null>((resolve) => {
        if (!db) return resolve(null);
        try {
          const tx = db.transaction(store, mode);
          const req = fn(tx.objectStore(store));
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => resolve(null);
          tx.onerror = () => resolve(null);
          tx.onabort = () => resolve(null);
        } catch {
          resolve(null);
        }
      }),
  );
}

export async function getMeta<K extends keyof SwMeta>(k: K): Promise<SwMeta[K] | null> {
  const v = await run<unknown>("meta", "readonly", (s) => s.get(k));
  return (v as SwMeta[K] | undefined) ?? null;
}

export async function setMeta<K extends keyof SwMeta>(k: K, v: SwMeta[K]): Promise<void> {
  await run("meta", "readwrite", (s) => s.put(v, k));
}

export async function delMeta(k: keyof SwMeta): Promise<void> {
  await run("meta", "readwrite", (s) => s.delete(k));
}

export async function putEntry(e: IndexEntry): Promise<void> {
  await run("entries", "readwrite", (s) => s.put(e));
}

export async function allEntries(): Promise<IndexEntry[]> {
  const v = await run<IndexEntry[]>("entries", "readonly", (s) => s.getAll());
  return Array.isArray(v) ? v : [];
}

export async function deleteEntries(urls: string[]): Promise<void> {
  const db = await open();
  if (!db || urls.length === 0) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction("entries", "readwrite");
      const s = tx.objectStore("entries");
      for (const u of urls) s.delete(u);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function touch(url: string, at: string): Promise<void> {
  const e = await run<IndexEntry | undefined>("entries", "readonly", (s) => s.get(url));
  if (e) await putEntry({ ...e, lastAccess: at });
}
