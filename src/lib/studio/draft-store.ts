/**
 * Rascunho local do editor de matéria (item 5, E-04; base do rascunho automático do item 48).
 * Fica só neste aparelho (`localStorage`, chave `cn:draft:<id>`). Armazenamento indisponível
 * (janela privada, cota, bloqueio) nunca lança: gravar vira no-op e ler devolve `null`.
 */

export interface DraftData {
  title: string;
  dek: string;
  /** Documento do texto rico (JSON do Tiptap). */
  body: unknown;
  sectionSlug: string;
  topicId: string | null;
  tags: string[];
  neighborhoods: string[];
  seoTitle: string;
  seoDescription: string;
  /** Versão do servidor sobre a qual o texto local foi escrito. */
  baseVersion: number;
  /** ISO 8601 do momento em que o rascunho foi guardado. */
  savedAt: string;
}

export const draftKey = (articleId: string) => `cn:draft:${articleId}`;

const isStr = (v: unknown): v is string => typeof v === "string";
const isStrList = (v: unknown): v is string[] => Array.isArray(v) && v.every(isStr);

function isDraft(v: unknown): v is DraftData {
  if (typeof v !== "object" || v === null) return false;
  const d = v as Record<string, unknown>;
  return (
    isStr(d.title) &&
    isStr(d.dek) &&
    typeof d.body === "object" &&
    d.body !== null &&
    isStr(d.sectionSlug) &&
    (d.topicId === null || isStr(d.topicId)) &&
    isStrList(d.tags) &&
    isStrList(d.neighborhoods) &&
    isStr(d.seoTitle) &&
    isStr(d.seoDescription) &&
    typeof d.baseVersion === "number" &&
    isStr(d.savedAt)
  );
}

const listeners = new Set<() => void>();
const notify = () => {
  for (const l of listeners) l();
};

/**
 * Avisa quando um rascunho é guardado ou apagado (nesta aba ou em outra), para
 * `useSyncExternalStore`. Devolve a função que cancela a inscrição.
 */
export function subscribeDrafts(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key.startsWith("cn:draft:")) listener();
  };
  if (typeof window !== "undefined") window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    if (typeof window !== "undefined") window.removeEventListener("storage", onStorage);
  };
}

export function hasDraft(articleId: string): boolean {
  return loadDraft(articleId) !== null;
}

export function saveDraft(articleId: string, data: DraftData): void {
  try {
    localStorage.setItem(draftKey(articleId), JSON.stringify(data));
  } catch {
    // Sem armazenamento local: o texto continua só na tela.
  }
  notify();
}

export function loadDraft(articleId: string): DraftData | null {
  try {
    const raw = localStorage.getItem(draftKey(articleId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isDraft(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function clearDraft(articleId: string): void {
  try {
    localStorage.removeItem(draftKey(articleId));
  } catch {
    // Nada a apagar quando o armazenamento não está disponível.
  }
  notify();
}
