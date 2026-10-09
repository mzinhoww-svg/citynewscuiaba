import { SOCIAL_AGENDA as S } from "@/content/pt-BR/social-agenda";
import { AGENDA } from "@/content/pt-BR/portal-agenda";
import { originNote } from "@/lib/agenda/origin-note";
import { dayLabel } from "@/lib/newsletter/agenda-edition";
import { formatDayMonth, formatHour, localDateKey } from "@/lib/format/date";
import type { WeekEvent, WeekRange } from "./pick-week";

/**
 * Item do pacote "Agenda da semana" (`social_packages.items`, jsonb): só os campos confirmados
 * do evento, já em texto. É o que o slide e a legenda usam; o Estúdio mostra e permite tirar.
 */
export interface PackageItem {
  eventId: string;
  slug: string;
  title: string;
  /** Dia do slide ("AAAA-MM-DD"): o início, ou a segunda se já estava em cartaz. */
  day: string;
  /** "Terça, 13 de outubro" */
  dayLabel: string;
  /** "19h", "19h às 22h" ou "Desde 4 out". */
  time: string;
  /** "Teatro do Cerrado, Centro" */
  venue: string;
  /** "Gratuito" ou "R$ 40,00"; `null` = preço não informado ("Preço: consulte a fonte"). */
  price: string | null;
  /** "Com informações de {fonte}" (e a confirmação), ou `null` sem fonte registrada. */
  origin: string | null;
  /** Nome da fonte das informações ("Com informações de {fonte}" no slide), ou `null`. */
  source: string | null;
  /** O título não coube no slide nem no corpo mínimo (linhas cortadas; a legenda tem tudo). */
  titleClamped?: boolean;
  /** Foto de divulgação permitida pelo Media Registry (política reproduction), ou `null`. */
  image: PackageImage | null;
}

export interface PackageImage {
  /** `media_assets.id` */
  assetId: string;
  /** Nome da fonte para "Foto: reprodução web · {fonte}". */
  credit: string;
  /** Página do evento na fonte ("Ver original"). */
  originUrl: string | null;
}

const MEDIA_SRC = /^\/api\/media\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

/**
 * Foto do evento para o slide: só reprodução com crédito (a legenda "Foto: reprodução web ·
 * {fonte}" precisa do nome) e servida pela rota própria (o id do ativo sai do `src`).
 */
export function packageImage(e: Pick<WeekEvent, "image">): PackageImage | null {
  const img = e.image;
  if (!img || img.kind !== "reproduction" || !img.credit) return null;
  const id = MEDIA_SRC.exec(img.src)?.[1];
  if (!id) return null;
  const origin = img.originUrl && /^https?:\/\//i.test(img.originUrl) ? img.originUrl : null;
  return { assetId: id.toLowerCase(), credit: plainText(img.credit), originUrl: origin };
}

/**
 * Texto do slide e da legenda sem emoji (regra do portal; a fonte nem tem os glifos): tira
 * pictogramas, o seletor de variação (U+FE0F) e o junção de largura zero (U+200D) e junta os
 * espaços que sobram.
 */
export function plainText(s: string): string {
  return s
    .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

const monthFormatter = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", month: "long" });
const keyDate = (key: string) => new Date(`${key}T12:00:00Z`);

/** "12 a 18 de outubro"; cruzando o mês, "28 de setembro a 4 de outubro". */
export function weekLabel(range: Pick<WeekRange, "days">): string {
  const from = range.days[0] ?? "";
  const to = range.days[range.days.length - 1] ?? from;
  const day = (k: string) => String(keyDate(k).getUTCDate());
  const month = (k: string) => monthFormatter.format(keyDate(k));
  return month(from) === month(to)
    ? S.range(day(from), `${day(to)} de ${month(to)}`)
    : S.range(`${day(from)} de ${month(from)}`, `${day(to)} de ${month(to)}`);
}

function timeOf(e: WeekEvent, range: WeekRange): string {
  if (Date.parse(e.startsAt) < range.start.getTime()) return S.since(formatDayMonth(e.startsAt));
  const start = formatHour(e.startsAt);
  if (e.endsAt && localDateKey(e.endsAt) === localDateKey(e.startsAt))
    return `${start} às ${formatHour(e.endsAt)}`;
  return start;
}

function priceOf(e: WeekEvent): string | null {
  if (e.priceUnknown) return null;
  if (e.isFree) return S.freePrice;
  return e.priceCents !== null && e.priceCents > 0 ? AGENDA.price(e.priceCents) : null;
}

/** Itens do pacote na ordem dos slides. */
export function packageItems(events: readonly WeekEvent[], range: WeekRange): PackageItem[] {
  return events.map((e) => {
    const day = localDateKey(new Date(Math.max(Date.parse(e.startsAt), range.start.getTime())));
    return {
      eventId: e.id,
      slug: e.slug,
      title: plainText(e.title),
      day,
      dayLabel: dayLabel(day),
      time: timeOf(e, range),
      venue: plainText(e.neighborhood ? `${e.venue}, ${e.neighborhood}` : e.venue),
      price: priceOf(e),
      origin: plainText(originNote(e).join(" · ")) || null,
      source: originNote(e).length && e.sourceName ? plainText(e.sourceName) || null : null,
      image: packageImage(e),
    };
  });
}
