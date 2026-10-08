import { COLLECTED_DESCRIPTION as T } from "@/content/pt-BR/agenda-coletor";
import { NEIGHBORHOODS } from "@/content/pt-BR/neighborhoods";
import { AGENDA } from "@/content/pt-BR/portal-agenda";
import { dayStart, formatHour, formatLongDate, localDateKey } from "@/lib/format/date";
import { slugify } from "@/lib/pipeline/slug";
import { sanitizeExternalText } from "@/lib/security/sanitize";
import type { AgendaSource, NormalizedEvent, RawEvent, RejectReason } from "./types";
import { fold } from "@/lib/text/fold";

export type NormalizeResult =
  { ok: true; event: NormalizedEvent } | { ok: false; reasons: RejectReason[] };

const LOWER_WORDS = new Set([
  "de",
  "da",
  "do",
  "das",
  "dos",
  "e",
  "em",
  "no",
  "na",
  "com",
  "para",
  "a",
  "o",
]);

/** Título todo em caixa alta vira "Caixa Alta de Título"; siglas curtas (DJ, MT) ficam como estão. */
export function tidyTitle(raw: string): string {
  let t = raw
    .replace(/\s*\((c[oó]pia|copy)\)\s*/gi, " ")
    .replace(/\s*[|\-–]\s*cuiab[aá](\/MT)?\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  const letters = t.replace(/[^\p{L}]/gu, "");
  if (
    letters.length >= 6 &&
    letters === letters.toUpperCase() &&
    letters !== letters.toLowerCase()
  ) {
    t = t
      .split(" ")
      .map((w, i) => {
        const bare = w.replace(/[^\p{L}]/gu, "");
        if (bare.length <= 3 && i > 0 && LOWER_WORDS.has(bare.toLowerCase()))
          return w.toLowerCase();
        if (bare.length <= 2 && /^\p{Lu}+$/u.test(bare)) return w;
        return w.charAt(0) + w.slice(1).toLowerCase();
      })
      .join(" ");
  }
  return t;
}

const CITY_OK = /^(cuiaba|varzea grande)$/;
const GENERIC_VENUE = /^(a definir|local a definir|a confirmar|online|tbd|em breve|-+)$/;

/** Instante de um início/fim da fonte; `null` = ilegível; `"date_only"` = sem horário. */
export function toInstant(raw: string | null | undefined): Date | "date_only" | null {
  const v = (raw ?? "").trim();
  if (!v) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return "date_only";
  const local = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::\d{2})?$/.exec(v);
  if (local) {
    const base = dayStart(local[1] ?? "");
    if (Number.isNaN(base.getTime())) return null;
    return new Date(base.getTime() + (Number(local[2]) * 60 + Number(local[3])) * 60_000);
  }
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

const CATEGORY_RULES: [string, RegExp][] = [
  ["infantil", /infantil|crianc|kids/],
  ["teatro", /\bpeca\b|teatro|espetaculo|comedia|stand.?up/],
  ["cinema", /\bcine|filme|cinema|mostra de curtas/],
  ["esporte", /corrida|campeonato|torneio|\bjogo\b|maratona|futebol|copa\b|pedal/],
  ["gastronomia", /gastronom|culinar|degustac|jantar|festival de comida|chopp|cerveja/],
  ["feira", /\bfeira|artesanato|mercado|\bexpo\b|exposicao de produtos/],
  [
    "musica",
    /show|musica|banda|\bdj\b|samba|sertanej|rasqueado|siriri|cururu|festival|baile|forro|rock|pagode|funk|eletronic/,
  ],
  ["cultura", /exposicao|museu|sarau|cultura|literat|danca|dance|ballroom|drag/],
];

export const CATEGORIES = Object.keys(AGENDA.categories);

/** Categoria pelo texto (título e local), sem acento nem caixa; `fallback` quando nada casa. */
export function categoryFromText(text: string, fallback = "cultura"): string {
  const t = fold(text);
  return CATEGORY_RULES.find(([, re]) => re.test(t))?.[0] ?? fallback;
}

function categoryOf(raw: RawEvent, source: AgendaSource): string {
  const text = fold(`${raw.title} ${raw.category ?? ""}`);
  const hit = CATEGORY_RULES.find(([, re]) => re.test(text));
  if (hit) return hit[0];
  const given = fold(raw.category ?? "");
  if (CATEGORIES.includes(given)) return given;
  return source.defaultCategory ?? "cultura";
}

function neighborhoodOf(raw: RawEvent, source: AgendaSource): string | null {
  const direct = fold(raw.neighborhood ?? "");
  const byName = NEIGHBORHOODS.find((n) => fold(n.name) === direct);
  if (byName) return byName.name;
  const hay = fold(`${raw.address ?? ""} ${raw.venue ?? ""}`);
  const inText = NEIGHBORHOODS.find(
    (n) => n.slug !== "varzea-grande" && hay.includes(fold(n.name)),
  );
  if (inText) return inText.name;
  if (fold(raw.city ?? "") === "varzea grande") return "Várzea Grande";
  const fallback = NEIGHBORHOODS.find(
    (n) => fold(n.name) === fold(source.defaultNeighborhood ?? ""),
  );
  return fallback?.name ?? null;
}

function resolveUrl(url: string | null | undefined, base: string): string | null {
  if (!url) return null;
  try {
    return new URL(url, base).toString();
  } catch {
    return null;
  }
}

const STOP = new Set([
  "de",
  "da",
  "do",
  "das",
  "dos",
  "a",
  "o",
  "e",
  "em",
  "no",
  "na",
  "com",
  "para",
  "the",
]);

/** Chave de duplicidade: título (sem acento e sem palavras de ligação), dia local e local. */
export function dedupeKeyOf(title: string, startsAt: string, venue: string): string {
  const t = slugify(
    fold(title)
      .split(/[^a-z0-9]+/)
      .filter((w) => w && !STOP.has(w))
      .join(" "),
    60,
  );
  return `${t}|${localDateKey(startsAt)}|${slugify(venue, 40)}`;
}

/**
 * Descrição própria de até 2 frases (nenhum texto da fonte): categoria, local, data, hora e preço.
 * Refeita quando a confirmação muda data, hora ou local de um evento já guardado.
 */
export function describeEvent(
  e: Pick<
    NormalizedEvent,
    "category" | "venue" | "neighborhood" | "startsAt" | "priceCents" | "priceUnknown"
  >,
): string {
  const place =
    e.neighborhood && e.neighborhood !== "Várzea Grande"
      ? `${e.venue}, ${e.neighborhood}`
      : e.venue;
  const price = e.priceUnknown
    ? T.unknownPrice
    : e.priceCents === 0
      ? T.free
      : T.from(AGENDA.price(e.priceCents ?? 0));
  return `${T.where(AGENDA.categories[e.category] ?? e.category, place, formatLongDate(e.startsAt), formatHour(e.startsAt))} ${price}`;
}

/**
 * Normaliza um evento da fonte: título e local limpos (texto externo é dado), data e hora em
 * America/Cuiabá, bairro da lista curada, preço (ou "não informado"), categoria, link para o
 * original e descrição própria de até 2 frases. Itens que não servem voltam com os motivos.
 */
export function normalizeEvent(raw: RawEvent, source: AgendaSource): NormalizeResult {
  const reasons: RejectReason[] = [];
  const title = sanitizeExternalText(raw.title ?? "", 160);
  title.text = tidyTitle(title.text);
  if (!title.text || title.text.length < 3) reasons.push("sem_titulo");
  if (title.injection) reasons.push("texto_suspeito");

  const start = toInstant(raw.start);
  if (start === null) reasons.push("sem_data");
  else if (start === "date_only") reasons.push("sem_horario");

  const venueText = fold(`${raw.venue ?? ""} ${raw.address ?? ""}`);
  if (raw.online || /\bonline\b|\bao vivo\b|\bvirtual\b/.test(venueText))
    reasons.push("evento_online");
  const city = fold(raw.city ?? "");
  if ((city && !CITY_OK.test(city)) || (source.requireCity && !city))
    reasons.push("fora_de_cuiaba");

  const venueRaw = sanitizeExternalText(raw.venue ?? source.defaultVenue ?? "", 120).text;
  const venue =
    venueRaw ||
    sanitizeExternalText(raw.address ?? "", 120)
      .text.split(",")[0]
      ?.trim() ||
    "";
  const venueKnown = venue.length >= 3 && !GENERIC_VENUE.test(fold(venue));
  if (!venueKnown) reasons.push("local_desconhecido");

  const sourceUrl = resolveUrl(raw.url, source.url);
  if (!sourceUrl) reasons.push("sem_link");

  if (reasons.length > 0 || !(start instanceof Date) || !sourceUrl) return { ok: false, reasons };

  const end = toInstant(raw.end);
  const endsAt = end instanceof Date && end.getTime() > start.getTime() ? end.toISOString() : null;
  const startsAt = start.toISOString();
  const neighborhood = neighborhoodOf(raw, source);
  const category = categoryOf(raw, source);
  const priceUnknown = raw.priceCents === undefined || raw.priceCents === null;
  const priceCents = priceUnknown ? null : (raw.priceCents ?? 0);
  const description = describeEvent({
    category,
    venue,
    neighborhood,
    startsAt,
    priceCents,
    priceUnknown,
  });

  return {
    ok: true,
    event: {
      title: title.text,
      startsAt,
      endsAt,
      venue,
      neighborhood,
      priceCents,
      priceUnknown,
      category,
      sourceUrl,
      sourceId: source.id,
      origin: source.origin,
      description,
      dedupeKey: dedupeKeyOf(title.text, startsAt, venue),
      venueKnown,
      sourceRef: source.uuid || null,
      confirms: source.confirms,
      // Só outra fonte que confirma preenche (confirmação entre fontes); a fonte que confirma
      // conta como confirmada pelo próprio `sources.confirms`.
      confirmedBySourceId: null,
      evidence: {},
    },
  };
}
