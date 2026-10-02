/**
 * Contrato entre a página e o service worker (spec 2026-09-28 §8): nomes de cache, limites,
 * marcador de resposta cacheável (G2) e as mensagens trocadas por `postMessage`.
 * Só tipos e constantes: a página importa este módulo sem trazer o SW.
 */
import type { BrowserFamily, DeviceClass } from "@/lib/push/types";

export const SW_VERSION = "2026.09.28-1";

export const CACHES = {
  shell: "cn-shell-v1",
  /** Salvas: mesmo nome e conteúdo do SW anterior; nunca apagado nem no LRU. */
  salvos: "cn-salvos-v1",
  paginas: "cn-paginas-v1",
  lidas: "cn-lidas-v1",
  assets: "cn-assets-v1",
} as const;
export type CacheName = (typeof CACHES)[keyof typeof CACHES];

export const LIMITS = {
  salvos: 20,
  paginas: 12,
  lidas: 30,
  capBytes: 25 * 1024 * 1024,
  networkTimeoutMs: 4000,
  assetSweepEvery: 50,
} as const;

/** O proxy marca com `x-cn-offline: 1` só rota da allowlist sem sessão (G2). */
export const OFFLINE_MARKER_HEADER = "x-cn-offline";

export const NEVER_CACHE = [
  "/estudio",
  "/api",
  "/entrar",
  "/criar-conta",
  "/perfil",
  "/privacidade",
  "/busca",
  "/pergunte",
  "/alertas",
] as const;

export const SHELL_URLS = [
  "/offline.html",
  "/offline.js",
  "/offline.css",
  "/icons/icon-192.png",
  "/icons/badge-72.png",
  "/manifest.webmanifest",
] as const;

export interface IndexEntry {
  url: string;
  cache: string;
  title: string | null;
  bytes: number;
  cachedAt: string;
  lastAccess: string;
}

export interface OfflineItem {
  url: string;
  title: string;
  cachedAt: string;
  /** "Salva às 14h32" ou "Salva em 27/09 às 14h32". */
  label: string;
}

export interface OfflineListing {
  paginas: OfflineItem[];
  salvas: OfflineItem[];
  lidas: OfflineItem[];
}

export interface SwConsent {
  metrics: boolean;
  device: DeviceClass;
  browser: BrowserFamily;
}

export type SwInbound =
  | { type: "cache-saved"; paths: string[] }
  | ({ type: "consent" } & SwConsent)
  | { type: "served-from-cache"; url: string }
  | { type: "list-offline" }
  | { type: "clear-offline" };

export type SwReply = { cachedAt: string | null } | OfflineListing | { cleared: true };
