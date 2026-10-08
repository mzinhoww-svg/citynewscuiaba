import type { RawEvent } from "../types";

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null =>
  typeof v === "string" && v.trim() !== "" ? v.trim() : null;

/** Tira só o sufixo de hora no fim: ", 19h", " - 19h", ", 19h30". */
const HOUR_SUFFIX = /\s*(?:,|-|–)\s*\d{1,2}h(?:\d{2})?\s*$/i;
const cleanTitle = (t: string): string => t.replace(HOUR_SUFFIX, "").trim();

/** "YYYY-MM-DD HH:mm:ss" (relógio local do evento) → "YYYY-MM-DDTHH:mm" ou só a data. */
function toLocal(v: unknown, allDay: boolean): string | null {
  const s = str(v);
  const m = s ? /^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}))?/.exec(s) : null;
  if (!m) return null;
  return allDay || !m[2] ? (m[1] ?? null) : `${m[1]}T${m[2]}`;
}

/** "Gratuito"/"Grátis"/"Free"/"0" → 0; primeiro "R$ n[,cc]" → centavos; resto → ausente. */
function price(v: unknown): number | null {
  const s = str(v);
  if (!s) return null;
  if (/^(gratuito|gr[aá]tis|free|0)$/i.test(s)) return 0;
  const m = /R\$\s*(\d{1,3}(?:\.\d{3})*|\d+)(?:,(\d{1,2}))?/.exec(s);
  if (!m) return null;
  const reais = Number((m[1] ?? "0").replace(/\./g, ""));
  const cents = m[2] ? Number(m[2].padEnd(2, "0")) : 0;
  return reais * 100 + cents;
}

/** Resposta da API REST do The Events Calendar (`/wp-json/tribe/events/v1/events`). */
export function extractTribe(body: string): { events: RawEvent[]; next: string | null } {
  const none = { events: [], next: null };
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return none;
  }
  if (!isObj(json) || !Array.isArray(json["events"])) return none;
  const events: RawEvent[] = [];
  for (const it of json["events"]) {
    if (!isObj(it)) continue;
    const rawTitle = str(it["title"]);
    if (!rawTitle) continue;
    const allDay = it["all_day"] === true;
    const venue = isObj(it["venue"]) ? it["venue"] : {};
    const cats = Array.isArray(it["categories"]) ? it["categories"] : [];
    const first = cats[0];
    const priceCents = price(it["cost"]);
    const start = toLocal(it["start_date"], allDay) ?? "";
    const end = toLocal(it["end_date"], allDay);
    events.push({
      title: cleanTitle(rawTitle),
      start,
      end: end === start ? null : end,
      venue: str(venue["venue"]),
      address: str(venue["address"]),
      city: str(venue["city"]),
      url: str(it["url"]),
      category: isObj(first) ? str(first["name"]) : null,
      ...(priceCents === null ? {} : { priceCents }),
    });
  }
  return { events, next: str(json["next_rest_url"]) };
}
