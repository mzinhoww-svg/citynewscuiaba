/**
 * Histórico local do chat (UI-T13): só neste navegador (IndexedDB) e só com consentimento de
 * Personalização; quem decide é o componente, que nem lê nem grava sem ele. Sem consentimento a
 * conversa vive só na memória da aba. Nada sai do aparelho.
 */
import { createStore, del, get, set } from "idb-keyval";
import type { ChatTurn } from "./index";

export interface SavedConversation {
  id: string;
  startedAt: string;
  turns: ChatTurn[];
}

export interface ChatHistoryStore {
  /** Mais recentes primeiro. */
  list(): Promise<SavedConversation[]>;
  save(c: SavedConversation): Promise<void>;
  clear(): Promise<void>;
}

/** Conversas guardadas; as mais antigas saem. */
export const MAX_CONVERSATIONS = 20;
/** Turnos por conversa guardada. */
export const MAX_TURNS = 30;
const KEY = "conversas";

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const STATUSES = new Set(["answer", "refused", "error", "rate_limited", "off"]);

/** O que está no navegador pode ser antigo ou corrompido: só passa o que tem forma válida. */
export function normalizeConversations(raw: unknown): SavedConversation[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (c): c is SavedConversation =>
        isObj(c) &&
        typeof c.id === "string" &&
        typeof c.startedAt === "string" &&
        Array.isArray(c.turns),
    )
    .map((c) => ({
      id: c.id,
      startedAt: c.startedAt,
      turns: c.turns
        .filter(
          (t) =>
            isObj(t) &&
            typeof t.id === "string" &&
            typeof t.question === "string" &&
            typeof t.askedAt === "string" &&
            STATUSES.has(String(t.status)),
        )
        .slice(-MAX_TURNS),
    }))
    .filter((c) => c.turns.length > 0)
    .slice(0, MAX_CONVERSATIONS);
}

/** Turnos que valem guardar: os que terminaram (processando não). */
export function storableTurns(turns: ChatTurn[]): ChatTurn[] {
  return turns
    .filter((t) => t.status !== "processing")
    .map((t) => {
      const copy = { ...t };
      delete copy.step;
      return copy;
    })
    .slice(-MAX_TURNS);
}

function upsert(list: SavedConversation[], c: SavedConversation): SavedConversation[] {
  const turns = storableTurns(c.turns);
  const rest = list.filter((x) => x.id !== c.id);
  if (turns.length === 0) return rest;
  return [{ ...c, turns }, ...rest].slice(0, MAX_CONVERSATIONS);
}

interface KV {
  get(): Promise<unknown>;
  set(v: unknown): Promise<void>;
  del(): Promise<void>;
}

function storeOver(kv: KV): ChatHistoryStore {
  return {
    async list() {
      try {
        return normalizeConversations(await kv.get());
      } catch {
        return [];
      }
    },
    async save(c) {
      try {
        const current = normalizeConversations(await kv.get());
        await kv.set(upsert(current, c));
      } catch {
        // IndexedDB bloqueado: a conversa segue só na memória da aba.
      }
    },
    async clear() {
      try {
        await kv.del();
      } catch {
        // Nada a apagar.
      }
    },
  };
}

/** Para testes e navegador sem IndexedDB. */
export function memoryChatHistory(): ChatHistoryStore {
  let value: unknown = undefined;
  return storeOver({
    get: async () => structuredClone(value),
    set: async (v) => void (value = structuredClone(v)),
    del: async () => void (value = undefined),
  });
}

let shared: ChatHistoryStore | null = null;

/** IndexedDB próprio (`citynews-chat`), separado do perfil anônimo. */
export function browserChatHistory(): ChatHistoryStore {
  if (shared) return shared;
  if (typeof indexedDB === "undefined") return (shared = memoryChatHistory());
  const store = createStore("citynews-chat", "conversas");
  shared = storeOver({
    get: () => get(KEY, store),
    set: (v) => set(KEY, v, store),
    del: () => del(KEY, store),
  });
  return shared;
}
