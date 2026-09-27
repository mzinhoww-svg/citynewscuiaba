import type { Consent } from "@/lib/consent";

/** Motivos de "Ocultar" (spec §7.4). O último desliga a personalização. */
export type DismissReason = "not_interested" | "already_know" | "hide_topic" | "no_personalization";

export type FollowKind = "source" | "topic" | "section" | "collection";

/**
 * Perfil anônimo deste navegador (spec §5.3), guardado em IndexedDB. `anonId` só existe com
 * Personalização aceita; seguir, salvar e ocultar são escolhas explícitas e funcionam sem ela.
 * Histórico (30 dias), buscas (20) e interesses só são guardados com Personalização.
 */
export interface AnonProfile {
  anonId: string | null;
  createdAt: string;
  follows: { kind: FollowKind; id: string; at: string }[];
  saved: { ref: string; at: string; progress: number }[];
  history: {
    ref: string;
    sourceSlug?: string;
    section?: string;
    at: string;
    seconds: number;
    scrollPct: number;
  }[];
  searches: string[];
  interests: { key: string; evidence: string; weak: boolean }[];
  hidden: { sourceSlug: string; reason: DismissReason; at: string }[];
}

export type ReadEntry = Omit<AnonProfile["history"][number], "at"> & { at?: string };

/** Armazenamento chave-valor assíncrono (IndexedDB no navegador, memória nos testes). */
export interface KV {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  del(key: string): Promise<void>;
}

export interface AnonStore {
  /** `true` quando o navegador não deixou gravar: vale só nesta visita (Review Focus 2). */
  readonly degraded: boolean;
  get(): Promise<AnonProfile>;
  follow(kind: FollowKind, id: string): Promise<void>;
  unfollow(kind: FollowKind, id: string): Promise<void>;
  save(ref: string, progress?: number): Promise<void>;
  unsave(ref: string): Promise<void>;
  /** Só guarda com Personalização (perfil com `anonId`). */
  recordRead(entry: ReadEntry): Promise<void>;
  /** Só guarda com Personalização (perfil com `anonId`). */
  recordSearch(query: string): Promise<void>;
  hide(sourceSlug: string, reason: DismissReason): Promise<void>;
  unhide(sourceSlug: string): Promise<void>;
  /** Apaga histórico, buscas e interesses; mantém seguidas, salvos e ocultações. */
  clearHistory(): Promise<void>;
  /** Apaga o perfil inteiro. */
  reset(): Promise<void>;
  /**
   * Alinha o perfil ao consentimento: cria o `anonId` (UUID v4) com Personalização; sem ela,
   * apaga `anonId`, histórico, buscas e interesses. Devolve o `anonId` atual.
   */
  ensureAnonId(consent: Consent): Promise<string | null>;
}
