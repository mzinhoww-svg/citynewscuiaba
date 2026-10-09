import { NEWSLETTER_EDITION as T } from "@/content/pt-BR/newsletter";
import { AGENDA } from "@/content/pt-BR/portal-agenda";
import { originNote } from "@/lib/agenda/origin-note";
import type { EventView } from "@/lib/db/queries/types";
import {
  addDays,
  dayStart,
  formatDayMonth,
  formatHour,
  formatLongDate,
  localDateKey,
  localWeekday,
} from "@/lib/format/date";

/**
 * Edição "Agenda do fim de semana" (ARD-T5, spec 2026-10-08-agenda-rica-e-distribuicao §6).
 * Puro: recebe os eventos já lidos (a leitura usa a RLS pública: confirmado e não retirado) e
 * repete o filtro por defesa; monta os itens ordenados por dia, confirmados primeiro e horário.
 */

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Caminho da página do evento na Agenda; slug fora do formato leva à Agenda inteira. */
export function eventPath(slug: string): string {
  return SLUG.test(slug) ? `/agenda/${slug}` : "/agenda";
}

/**
 * Corte em `max` itens sem que um dia cheio tire os outros da edição: cada dia com eventos
 * fica com até `ceil(max / dias)` primeiro; as vagas que sobram vão, na ordem, para o resto.
 * A entrada já vem ordenada (dia, confirmados, horário) e a saída mantém essa ordem.
 */
export function fairCut<T extends { day: string }>(sorted: readonly T[], max: number): T[] {
  const days = new Set(sorted.map((x) => x.day)).size;
  if (sorted.length <= max || days === 0) return sorted.slice(0, max);
  const quota = Math.ceil(max / days);
  const perDay = new Map<string, number>();
  const picked = new Set<number>();
  sorted.forEach((x, i) => {
    const n = perDay.get(x.day) ?? 0;
    if (n < quota && picked.size < max) {
      perDay.set(x.day, n + 1);
      picked.add(i);
    }
  });
  sorted.forEach((_, i) => {
    if (picked.size < max) picked.add(i);
  });
  return sorted.filter((_, i) => picked.has(i));
}

/** Lista da newsletter que esta edição alimenta. */
export const AGENDA_LIST = "agenda-fds";
/** Menos que isso, a edição fica em rascunho e não sai. */
export const EDITION_MIN_ITEMS = 3;
export const EDITION_MAX_ITEMS = 12;

export interface WeekendRange {
  /** Sexta 00:00 em Cuiabá. */
  start: Date;
  /** Domingo 23:59:59 em Cuiabá. */
  end: Date;
  /** A sexta, "AAAA-MM-DD": chave da edição e da página `/newsletter/agenda/{data}`. */
  editionDate: string;
  /** Sexta, sábado e domingo ("AAAA-MM-DD"). */
  days: [string, string, string];
}

/**
 * Fim de semana da edição no fuso de Cuiabá: de segunda a quinta, o próximo; de sexta a
 * domingo, o corrente (rodar de novo no sábado reconstrói a mesma edição).
 */
export function weekendRange(now: Date): WeekendRange {
  const today = localDateKey(now);
  const w = localWeekday(now);
  const back: Record<number, number> = { 5: 0, 6: -1, 0: -2 };
  const friday = addDays(today, back[w] ?? 5 - w);
  const days: [string, string, string] = [friday, addDays(friday, 1), addDays(friday, 2)];
  return {
    start: dayStart(friday),
    end: new Date(dayStart(addDays(friday, 3)).getTime() - 1000),
    editionDate: friday,
    days,
  };
}

/** O que a edição usa do evento público (`EventView`), mais a retirada para o filtro de defesa. */
export type EditionEvent = Pick<
  EventView,
  | "slug"
  | "title"
  | "startsAt"
  | "endsAt"
  | "venue"
  | "neighborhood"
  | "priceCents"
  | "isFree"
  | "priceUnknown"
  | "origin"
  | "sourceName"
  | "confirmedByName"
  | "confirmed"
  | "confirmedAt"
> & { withdrawnAt?: string | null };

/** Item gravado em `newsletter_editions.items` (dado, nunca HTML). */
export interface EditionItem {
  /** Dia do fim de semana em que o item aparece ("AAAA-MM-DD"). */
  day: string;
  /** "Sábado, 10 de outubro" */
  dayLabel: string;
  slug: string;
  title: string;
  /** Link absoluto da página do evento. */
  url: string;
  when: string;
  where: string;
  price: string;
  /** "Com informações de {fonte}" (e a confirmação), ou `null` sem fonte registrada. */
  origin: string | null;
}

export interface AgendaEdition {
  status: "draft" | "ready";
  /** Motivo do rascunho. */
  reason?: "few_events";
  editionDate: string;
  /** "9 a 11 de outubro" */
  rangeLabel: string;
  subject: string;
  items: EditionItem[];
}

const monthFormatter = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", month: "long" });
const keyDate = (key: string) => new Date(`${key}T12:00:00Z`);
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "9 a 11 de outubro"; cruzando o mês, "30 de outubro a 1 de novembro". */
export function rangeLabel(range: Pick<WeekendRange, "days">): string {
  const [from, , to] = range.days;
  const day = (k: string) => String(keyDate(k).getUTCDate());
  const month = (k: string) => monthFormatter.format(keyDate(k));
  return month(from) === month(to)
    ? T.range(day(from), `${day(to)} de ${month(to)}`)
    : T.range(`${day(from)} de ${month(from)}`, `${day(to)} de ${month(to)}`);
}

/** "Sábado, 10 de outubro" para a chave do dia. */
export function dayLabel(key: string): string {
  return capitalize(formatLongDate(keyDate(key).toISOString()));
}

function when(e: EditionEvent, range: WeekendRange): string {
  const startsBefore = Date.parse(e.startsAt) < range.start.getTime();
  const start = startsBefore ? T.since(formatDayMonth(e.startsAt)) : formatHour(e.startsAt);
  let end = "";
  if (e.endsAt) {
    end =
      !startsBefore && localDateKey(e.endsAt) === localDateKey(e.startsAt)
        ? T.until(formatHour(e.endsAt))
        : T.until(`${formatDayMonth(e.endsAt)}, ${formatHour(e.endsAt)}`);
  }
  return capitalize([start, end].filter(Boolean).join(" "));
}

function price(e: EditionEvent): string {
  if (e.priceUnknown) return T.unknownPrice;
  if (e.isFree) return T.freePrice;
  return e.priceCents !== null && e.priceCents > 0 ? AGENDA.price(e.priceCents) : T.unknownPrice;
}

function overlaps(e: EditionEvent, range: WeekendRange): boolean {
  const s = Date.parse(e.startsAt);
  const end = e.endsAt ? Date.parse(e.endsAt) : s;
  return !Number.isNaN(s) && s <= range.end.getTime() && end >= range.start.getTime();
}

/**
 * Monta a edição: só eventos confirmados, não retirados e que tocam o fim de semana; cada um
 * entra no dia em que começa (ou na sexta, se já estava em cartaz); ordem por dia, confirmados
 * pela organização ou fonte oficial primeiro e horário; até 12, com cota justa por dia
 * (`fairCut`). Com menos de 3, `draft`.
 */
export function buildAgendaEdition(
  events: readonly EditionEvent[],
  range: WeekendRange,
  opts: { siteUrl: string },
): AgendaEdition {
  const base = opts.siteUrl.replace(/\/+$/, "");
  const seen = new Set<string>();
  const kept = events.filter((e) => {
    if (!e.confirmedAt || e.withdrawnAt || !overlaps(e, range) || seen.has(e.slug)) return false;
    seen.add(e.slug);
    return true;
  });
  const dayOf = (e: EditionEvent) =>
    localDateKey(new Date(Math.max(Date.parse(e.startsAt), range.start.getTime())));
  const sorted = kept
    .map((e) => ({ e, day: dayOf(e) }))
    .sort(
      (a, b) =>
        a.day.localeCompare(b.day) ||
        Number(b.e.confirmed) - Number(a.e.confirmed) ||
        Date.parse(a.e.startsAt) - Date.parse(b.e.startsAt) ||
        a.e.title.localeCompare(b.e.title, "pt-BR"),
    );
  const items: EditionItem[] = fairCut(sorted, EDITION_MAX_ITEMS).map(({ e, day }) => ({
    day,
    dayLabel: dayLabel(day),
    slug: e.slug,
    title: e.title,
    url: `${base}${eventPath(e.slug)}`,
    when: when(e, range),
    where: e.neighborhood ? `${e.venue}, ${e.neighborhood}` : e.venue,
    price: price(e),
    origin: originNote(e).join(" · ") || null,
  }));
  const label = rangeLabel(range);
  return {
    status: items.length < EDITION_MIN_ITEMS ? "draft" : "ready",
    ...(items.length < EDITION_MIN_ITEMS ? { reason: "few_events" as const } : {}),
    editionDate: range.editionDate,
    rangeLabel: label,
    subject: T.subject(label),
    items,
  };
}

export interface EditionDay {
  day: string;
  dayLabel: string;
  items: EditionItem[];
}

/** Itens agrupados por dia, na ordem em que vieram. */
export function groupEditionItems(items: readonly EditionItem[]): EditionDay[] {
  const out: EditionDay[] = [];
  for (const item of items) {
    const last = out.at(-1);
    if (last && last.day === item.day) last.items.push(item);
    else out.push({ day: item.day, dayLabel: item.dayLabel, items: [item] });
  }
  return out;
}

/** Fim de semana de uma edição já gravada, pela data da sexta ("AAAA-MM-DD"). */
export function rangeOfEdition(editionDate: string): Pick<WeekendRange, "days" | "editionDate"> {
  return {
    editionDate,
    days: [editionDate, addDays(editionDate, 1), addDays(editionDate, 2)],
  };
}
