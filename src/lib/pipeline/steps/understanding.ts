import type { CollectedItemRecord } from "../ports";

const ITEM_REF = /^item:([^\s]+)$/;

/** Id do item de uma referência `item:<id>`. */
export function itemIdFrom(ref: string): string | null {
  return ITEM_REF.exec(ref)?.[1] ?? null;
}

/** Janela de agrupamento e de busca de duplicados (spec §6.2, plano P3 Global Constraints). */
export const TOPIC_WINDOW_HOURS = 72;

export const windowSince = (now: Date): Date =>
  new Date(now.getTime() - TOPIC_WINDOW_HOURS * 3600_000);

/** Texto usado para o embedding do item: título e linha de apoio. */
export const itemText = (item: Pick<CollectedItemRecord, "title" | "excerpt">): string =>
  item.excerpt ? `${item.title}\n${item.excerpt}` : item.title;
