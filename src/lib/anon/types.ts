import type { Consent } from "@/lib/consent";

/** Motivos de "Ocultar" (spec §7.4). O último desliga a personalização. */
export type DismissReason = "not_interested" | "already_know" | "hide_topic" | "no_personalization";

export type FollowKind = "source" | "topic" | "section" | "collection";

/** Alvo de alerta (P18): bairro, editoria (tema), assunto, urgentes ou agenda. */
export type AlertKind = "bairro" | "tema" | "assunto" | "urgentes" | "agenda";
export type AlertFrequency = "immediate" | "daily" | "weekly";
export type AlertChannel = "browser" | "email";

/** Alerta guardado neste navegador. Por e-mail fica `pending_email` até a confirmação. */
export interface LocalAlert {
  id: string;
  kind: AlertKind;
  target: string;
  label: string;
  frequency: AlertFrequency;
  channel: AlertChannel;
  status: "active" | "pending_email";
  email?: string;
  at: string;
}

export type NewAlert = Omit<LocalAlert, "id" | "at" | "status"> & { status?: LocalAlert["status"] };

/** Dados do salvo para listar em Favoritos sem ir ao servidor (e ler offline). */
export interface SavedMeta {
  title?: string;
  /** Caminho interno (`/materia/...`). */
  href?: string;
  section?: string;
}

/**
 * Perfil anônimo deste navegador (spec §5.3), guardado em IndexedDB. `anonId` só existe com
 * Personalização aceita; seguir, salvar e ocultar são escolhas explícitas e funcionam sem ela.
 * Histórico (30 dias), buscas (20) e interesses só são guardados com Personalização.
 */
export interface AnonProfile {
  anonId: string | null;
  createdAt: string;
  follows: { kind: FollowKind; id: string; at: string; label?: string }[];
  saved: ({ ref: string; at: string; progress: number } & SavedMeta)[];
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
  /** Coleções pessoais (Favoritos). */
  collections: { id: string; name: string; at: string; items: string[] }[];
  alerts: LocalAlert[];
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
  follow(kind: FollowKind, id: string, label?: string): Promise<void>;
  /** Nova ordem das seguidas de um tipo (as demais ficam onde estão). */
  reorderFollows(kind: FollowKind, ids: string[]): Promise<void>;
  unfollow(kind: FollowKind, id: string): Promise<void>;
  save(ref: string, progress?: number, meta?: SavedMeta): Promise<void>;
  /** Progresso de leitura de um salvo (0 a 100); ignora o que não está salvo. */
  setProgress(ref: string, progress: number): Promise<void>;
  createCollection(name: string): Promise<void>;
  renameCollection(id: string, name: string): Promise<void>;
  deleteCollection(id: string): Promise<void>;
  addAlert(a: NewAlert): Promise<void>;
  removeAlert(id: string): Promise<void>;
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
