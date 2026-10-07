import { TIME_ZONE } from "@/lib/format/date";

/**
 * Datas de feed para ISO UTC. Data sem fuso é hora de Cuiabá (`America/Cuiaba`, Review Focus 1),
 * calculada pelo banco de fusos do Intl (acerta o horário de verão que Cuiabá teve até 2019).
 * Entende RFC 822 (inglês e português), ISO 8601 e dd/mm/aaaa. Inválida ou impossível → null.
 */

const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  fev: 2,
  mar: 3,
  apr: 4,
  abr: 4,
  may: 5,
  mai: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  ago: 8,
  sep: 9,
  set: 9,
  oct: 10,
  out: 10,
  nov: 11,
  dec: 12,
  dez: 12,
};

/** Zonas nomeadas da RFC 822 (e as de uso comum no Brasil), em minutos a leste de UTC. */
const ZONES: Record<string, number> = {
  z: 0,
  ut: 0,
  utc: 0,
  gmt: 0,
  est: -300,
  edt: -240,
  cst: -360,
  cdt: -300,
  mst: -420,
  mdt: -360,
  pst: -480,
  pdt: -420,
  brt: -180,
  brst: -120,
  amt: -240,
  amst: -180,
};

interface Parts {
  y: number;
  mo: number;
  d: number;
  h: number;
  mi: number;
  s: number;
  ms: number;
}

const partsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  second: "numeric",
});

/** Diferença (ms) entre a hora de parede em Cuiabá e UTC no instante `ts`. */
function zoneOffsetMs(ts: number): number {
  const p: Record<string, number> = {};
  for (const { type, value } of partsFormatter.formatToParts(new Date(ts))) p[type] = Number(value);
  const wall = Date.UTC(p.year!, p.month! - 1, p.day!, p.hour! % 24, p.minute!, p.second!);
  return wall - Math.floor(ts / 1000) * 1000;
}

function localToUtc(p: Parts): number {
  const wall = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s, p.ms);
  let ts = wall - zoneOffsetMs(wall);
  ts = wall - zoneOffsetMs(ts); // segunda passada para transições de horário de verão
  return ts;
}

function valid(p: Parts): boolean {
  if (p.mo < 1 || p.mo > 12 || p.d < 1 || p.h > 23 || p.mi > 59 || p.s > 60) return false;
  const check = new Date(Date.UTC(p.y, p.mo - 1, p.d));
  return check.getUTCMonth() === p.mo - 1 && check.getUTCDate() === p.d;
}

function toIso(p: Parts, offsetMin: number | null): string | null {
  if (!valid(p)) return null;
  const ts =
    offsetMin === null
      ? localToUtc(p)
      : Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, Math.min(p.s, 59), p.ms) - offsetMin * 60_000;
  return Number.isFinite(ts) ? new Date(ts).toISOString() : null;
}

/** "Z", "+hh:mm", "-hhmm", "+hh", "GMT", "EST"… → minutos; vazio → null (sem fuso). */
function parseZone(raw: string | undefined): number | null | undefined {
  const z = (raw ?? "").trim().toLowerCase();
  if (z === "") return null;
  const num = /^(?:gmt|utc)?([+-])(\d{2}):?(\d{2})?$/.exec(z);
  if (num) {
    const mins = Number(num[2]) * 60 + Number(num[3] ?? 0);
    return num[1] === "-" ? -mins : mins;
  }
  return Object.hasOwn(ZONES, z) ? ZONES[z] : undefined;
}

const year = (y: string): number => (y.length === 2 ? 2000 + Number(y) : Number(y));
const fraction = (f: string | undefined): number => (f ? Math.round(Number(`0.${f}`) * 1000) : 0);

const ISO =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2})(?:[.,](\d{1,9}))?)?)?\s*(z|[+-]\d{2}(?::?\d{2})?|utc|gmt)?$/i;
const RFC822 =
  /^(?:[a-zà-ú]{3,}\.?,?\s+)?(\d{1,2})\s+([a-zà-ú]{3,})\.?\s+(\d{2}|\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?\s*([a-z]{1,5}|[+-]\d{2}:?\d{2}|(?:gmt|utc)[+-]\d{2}:?\d{2})?$/i;
const BR = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s*[,|-]?\s*(\d{1,2})[:h](\d{2})(?::(\d{2}))?)?$/i;
/** "3 de outubro de 2026", "03 de Outubro de 2026 às 06:30:00" (sites de órgãos públicos). */
const PT_LONG =
  /^(\d{1,2})\s+de\s+([a-zà-ú]{3,})\s+de\s+(\d{4})(?:\s*(?:às|as|,|-|\|)?\s*(\d{1,2})[:h](\d{2})(?::(\d{2}))?)?$/i;

export function parseFeedDate(input: string): string | null {
  const s = input.trim().replace(/\s+/g, " ");
  if (!s) return null;

  const iso = ISO.exec(s);
  if (iso) {
    const zone = parseZone(iso[8]);
    if (zone === undefined) return null;
    return toIso(
      {
        y: Number(iso[1]),
        mo: Number(iso[2]),
        d: Number(iso[3]),
        h: Number(iso[4] ?? 0),
        mi: Number(iso[5] ?? 0),
        s: Number(iso[6] ?? 0),
        ms: fraction(iso[7]),
      },
      zone,
    );
  }

  const rfc = RFC822.exec(s);
  if (rfc) {
    const month = MONTHS[rfc[2]!.slice(0, 3).toLowerCase()];
    const zone = parseZone(rfc[7]);
    if (month === undefined || zone === undefined) return null;
    return toIso(
      {
        y: year(rfc[3]!),
        mo: month,
        d: Number(rfc[1]),
        h: Number(rfc[4] ?? 0),
        mi: Number(rfc[5] ?? 0),
        s: Number(rfc[6] ?? 0),
        ms: 0,
      },
      zone,
    );
  }

  const pt = PT_LONG.exec(s);
  if (pt) {
    const month = MONTHS[pt[2]!.slice(0, 3).toLowerCase()];
    if (month === undefined) return null;
    return toIso(
      {
        y: Number(pt[3]),
        mo: month,
        d: Number(pt[1]),
        h: Number(pt[4] ?? 0),
        mi: Number(pt[5] ?? 0),
        s: Number(pt[6] ?? 0),
        ms: 0,
      },
      null,
    );
  }

  const br = BR.exec(s);
  if (br) {
    return toIso(
      {
        y: Number(br[3]),
        mo: Number(br[2]),
        d: Number(br[1]),
        h: Number(br[4] ?? 0),
        mi: Number(br[5] ?? 0),
        s: Number(br[6] ?? 0),
        ms: 0,
      },
      null,
    );
  }
  return null;
}

const IN_TEXT = [
  /\d{1,2}\/\d{1,2}\/\d{4}(?:\s*[,|-]?\s*\d{1,2}[:h]\d{2}(?::\d{2})?)?/,
  /\d{1,2}\s+de\s+[a-zà-ú]{3,}\s+de\s+\d{4}(?:\s*(?:às|as|,|-|\|)?\s*\d{1,2}[:h]\d{2}(?::\d{2})?)?/i,
  /\d{4}-\d{2}-\d{2}(?:[T ]\d{1,2}:\d{2}(?::\d{2})?)?/,
];

/**
 * Procura uma data dentro de um texto com ruído ("Postado em 02/10/2026 13h47 · 1 day ago").
 * Só os formatos que `parseFeedDate` entende; devolve a primeira que valida, ou null.
 */
export function parseDateInText(input: string): string | null {
  const direct = parseFeedDate(input);
  if (direct) return direct;
  const s = input.replace(/\s+/g, " ");
  for (const re of IN_TEXT) {
    const m = re.exec(s);
    const iso = m ? parseFeedDate(m[0]) : null;
    if (iso) return iso;
  }
  return null;
}
