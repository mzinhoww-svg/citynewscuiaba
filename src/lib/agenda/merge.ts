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
  | "sourceUrl"
  | "organizer"
  | "ageRating"
  | "mediaId";

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
  organizer: "organizer",
  age_rating: "ageRating",
  media_id: "mediaId",
};

export type StoredEvent = {
  id: string;
  /** Nomes de coluna (snake_case) travados pela redação. */
  lockedFields: string[];
  withdrawnAt: string | null;
} & Pick<NormalizedEvent, EditableKey>;

/**
 * Evento a gravar numa coleta repetida: `null` se a redação o retirou (não regrava); campos em
 * `lockedFields` mantêm o valor guardado, o resto vem da coleta. `dedupeKey` é a identidade da
 * linha: vem sempre da coleta, mesmo com título, data ou local travados. Imagem: uma por evento —
 * sem trava, a já guardada fica (a coleta não troca); com `media_id` travado, vale a da redação
 * (inclusive nenhuma) e a coleta nem tenta registrar outra (`imageUrl` nulo).
 */
export function mergeForSave(
  incoming: NormalizedEvent,
  stored: StoredEvent | null,
): NormalizedEvent | null {
  if (!stored) return incoming;
  if (stored.withdrawnAt) return null;
  const out: NormalizedEvent = { ...incoming, mediaId: incoming.mediaId ?? stored.mediaId };
  const patch: Partial<Pick<NormalizedEvent, EditableKey>> = {};
  for (const column of stored.lockedFields) {
    const key = LOCKABLE_COLUMNS[column];
    if (key) Object.assign(patch, { [key]: stored[key] });
  }
  Object.assign(out, patch);
  if (stored.lockedFields.includes("media_id")) {
    out.imageUrl = null;
    out.imageContext = null;
  }
  return out;
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
