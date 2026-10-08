import { localDateKey } from "@/lib/format/date";
import type { NormalizedEvent } from "./types";

/** Campos que a redação pode editar no Estúdio (e travar contra a próxima coleta). */
export type EditableKey =
  | "title"
  | "startsAt"
  | "endsAt"
  | "venue"
  | "neighborhood"
  | "priceCents"
  | "priceUnknown"
  | "category"
  | "description"
  | "sourceUrl";

/** `lockedFields` guarda nomes de coluna do banco; aqui, coluna → campo de `NormalizedEvent`. */
export const LOCKABLE_COLUMNS: Readonly<Record<string, EditableKey>> = {
  title: "title",
  starts_at: "startsAt",
  ends_at: "endsAt",
  venue: "venue",
  neighborhood: "neighborhood",
  price_cents: "priceCents",
  price_unknown: "priceUnknown",
  category: "category",
  description: "description",
  source_url: "sourceUrl",
};

export type StoredEvent = {
  id: string;
  /** Nomes de coluna (snake_case) travados pela redação. */
  lockedFields: string[];
  withdrawnAt: string | null;
} & Pick<NormalizedEvent, EditableKey>;

/**
 * Evento a gravar numa coleta repetida: `null` se a redação o retirou (não regrava); campos em
 * `lockedFields` mantêm o valor guardado, o resto vem da coleta.
 */
export function mergeForSave(
  incoming: NormalizedEvent,
  stored: StoredEvent | null,
): NormalizedEvent | null {
  if (!stored) return incoming;
  if (stored.withdrawnAt) return null;
  const out: NormalizedEvent = { ...incoming };
  const patch: Partial<Pick<NormalizedEvent, EditableKey>> = {};
  for (const column of stored.lockedFields) {
    const key = LOCKABLE_COLUMNS[column];
    if (key) Object.assign(patch, { [key]: stored[key] });
  }
  return Object.assign(out, patch);
}

/** Estável: por dia local, e dentro do dia os confirmados antes; o resto mantém a ordem da lista. */
export function sortConfirmedFirst<T extends { startsAt: string; confirmed: boolean }>(
  list: readonly T[],
): T[] {
  return list
    .map((item, i) => ({ item, i, day: localDateKey(item.startsAt) }))
    .sort(
      (a, b) =>
        a.day.localeCompare(b.day) ||
        Number(b.item.confirmed) - Number(a.item.confirmed) ||
        a.i - b.i,
    )
    .map((x) => x.item);
}
