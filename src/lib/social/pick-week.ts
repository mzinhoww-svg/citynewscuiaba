import type { EventView } from "@/lib/db/queries/types";
import { addDays, dayStart, localDateKey, localWeekday } from "@/lib/format/date";
import { fold } from "@/lib/text/fold";

/**
 * Seleção do pacote "Agenda da semana" do Instagram (ARD-T6, spec 2026-10-08 §7). Puro: recebe
 * os eventos já lidos pela leitura pública (RLS: confirmado e não retirado) e repete o filtro
 * por defesa.
 */

/** Teto de eventos do carrossel e de eventos do mesmo local. */
export const WEEK_MAX_EVENTS = 6;
export const WEEK_MAX_PER_VENUE = 2;

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export interface WeekRange {
  /** Segunda 00:00 em Cuiabá. */
  start: Date;
  /** Domingo 23:59:59 em Cuiabá. */
  end: Date;
  /** A segunda, "AAAA-MM-DD": chave do pacote e pasta dos PNGs. */
  weekStart: string;
  /** Segunda a domingo ("AAAA-MM-DD"). */
  days: string[];
}

/**
 * Semana corrente de Cuiabá (segunda a domingo) no instante `now`; o cron roda segunda 12h UTC
 * (8h em Cuiabá). Com `monday` ("AAAA-MM-DD" de uma segunda), a semana daquela segunda; data que
 * não é segunda vira a segunda da semana dela.
 */
export function weekRange(now: Date, monday?: string): WeekRange {
  const base = monday && DATE.test(monday) ? monday : localDateKey(now);
  const w =
    monday && DATE.test(monday) ? new Date(`${monday}T12:00:00Z`).getUTCDay() : localWeekday(now);
  const first = addDays(base, -((w + 6) % 7));
  const days = Array.from({ length: 7 }, (_, i) => addDays(first, i));
  return {
    start: dayStart(first),
    end: new Date(dayStart(addDays(first, 7)).getTime() - 1000),
    weekStart: first,
    days,
  };
}

/** O que o pacote usa do evento público, mais a retirada para o filtro de defesa. */
export type WeekEvent = Pick<
  EventView,
  | "id"
  | "slug"
  | "title"
  | "startsAt"
  | "endsAt"
  | "venue"
  | "neighborhood"
  | "venueSlug"
  | "priceCents"
  | "isFree"
  | "priceUnknown"
  | "origin"
  | "sourceName"
  | "confirmedByName"
  | "confirmed"
  | "confirmedAt"
  | "image"
> & { withdrawnAt?: string | null };

/**
 * Chave do local para o limite por local: o lugar do Guia quando há vínculo, senão o nome sem
 * acento, minúsculo, sem pontuação e com espaços simples.
 */
export function venueKey(e: Pick<WeekEvent, "venue" | "venueSlug">): string {
  if (e.venueSlug) return `guia:${e.venueSlug}`;
  const text = fold(e.venue)
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
  return `texto:${text}`;
}

function overlaps(e: WeekEvent, range: WeekRange): boolean {
  const s = Date.parse(e.startsAt);
  const end = e.endsAt ? Date.parse(e.endsAt) : s;
  return !Number.isNaN(s) && s <= range.end.getTime() && end >= range.start.getTime();
}

/**
 * Eventos do carrossel: confirmados, não retirados, que tocam a semana e não foram tirados do
 * pacote (`exclude`). Prioridade: com imagem primeiro, depois confirmados pela fonte, depois o
 * início; até 6, no máximo 2 por local. A saída volta à ordem cronológica (o carrossel segue a
 * semana).
 */
export function pickWeekEvents(
  events: readonly WeekEvent[],
  range: WeekRange,
  opts: { exclude?: readonly string[] } = {},
): WeekEvent[] {
  const excluded = new Set(opts.exclude ?? []);
  const seen = new Set<string>();
  const kept = events.filter((e) => {
    if (!e.confirmedAt || e.withdrawnAt || excluded.has(e.id) || seen.has(e.id)) return false;
    if (!overlaps(e, range)) return false;
    seen.add(e.id);
    return true;
  });
  const byStart = (a: WeekEvent, b: WeekEvent) =>
    Date.parse(a.startsAt) - Date.parse(b.startsAt) || a.title.localeCompare(b.title, "pt-BR");
  const priority = [...kept].sort(
    (a, b) =>
      Number(b.image !== null) - Number(a.image !== null) ||
      Number(b.confirmed) - Number(a.confirmed) ||
      byStart(a, b),
  );
  const perVenue = new Map<string, number>();
  const picked: WeekEvent[] = [];
  for (const e of priority) {
    if (picked.length >= WEEK_MAX_EVENTS) break;
    const key = venueKey(e);
    const count = perVenue.get(key) ?? 0;
    if (count >= WEEK_MAX_PER_VENUE) continue;
    perVenue.set(key, count + 1);
    picked.push(e);
  }
  return picked.sort(byStart);
}
