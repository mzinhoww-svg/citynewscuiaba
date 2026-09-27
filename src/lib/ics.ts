import { TIME_ZONE, localDateKey } from "@/lib/format/date";

/**
 * Arquivo .ics de um evento (P10) no fuso de Cuiabá: horários locais com
 * `TZID=America/Cuiaba` e VTIMEZONE declarado (UTC−4, sem horário de verão desde 2019).
 */
export interface IcsEvent {
  uid: string;
  title: string;
  startsAt: string;
  endsAt?: string | null;
  venue: string;
  url: string;
  description?: string | null;
}

const DEFAULT_DURATION_MS = 2 * 3_600_000;

const hm = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/** "20261003T200000" no relógio de Cuiabá. */
function local(d: Date): string {
  const date = localDateKey(d).replaceAll("-", "");
  const time = hm.format(d).replaceAll(":", "");
  return `${date}T${time}`;
}

/** "20261004T000000Z". */
function utc(d: Date): string {
  return d
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}

function escape(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** Dobra linhas em 75 octetos (RFC 5545 §3.1) sem partir caracteres. */
function fold(line: string): string[] {
  const enc = new TextEncoder();
  const out: string[] = [];
  let current = "";
  for (const ch of line) {
    const limit = out.length === 0 ? 75 : 74;
    if (enc.encode(current + ch).length > limit) {
      out.push(out.length === 0 ? current : ` ${current}`);
      current = ch;
    } else current += ch;
  }
  out.push(out.length === 0 ? current : ` ${current}`);
  return out;
}

function range(e: { startsAt: string; endsAt?: string | null }): [Date, Date] {
  const start = new Date(e.startsAt);
  const end = e.endsAt ? new Date(e.endsAt) : new Date(start.getTime() + DEFAULT_DURATION_MS);
  return [start, end];
}

export function toIcs(e: IcsEvent, now: Date = new Date()): string {
  const [start, end] = range(e);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//CityNews Cuiabá//Agenda//PT-BR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VTIMEZONE",
    `TZID:${TIME_ZONE}`,
    "BEGIN:STANDARD",
    "DTSTART:19700101T000000",
    "TZOFFSETFROM:-0400",
    "TZOFFSETTO:-0400",
    "TZNAME:-04",
    "END:STANDARD",
    "END:VTIMEZONE",
    "BEGIN:VEVENT",
    `UID:${e.uid}@citynews`,
    `DTSTAMP:${utc(now)}`,
    `DTSTART;TZID=${TIME_ZONE}:${local(start)}`,
    `DTEND;TZID=${TIME_ZONE}:${local(end)}`,
    `SUMMARY:${escape(e.title)}`,
    `LOCATION:${escape(e.venue)}`,
    `URL:${e.url}`,
    ...(e.description ? [`DESCRIPTION:${escape(e.description)}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.flatMap(fold).join("\r\n") + "\r\n";
}

/** "Adicionar ao Google Agenda" sem script de terceiros. */
export function googleCalendarUrl(e: IcsEvent): string {
  const [start, end] = range(e);
  const q = new URLSearchParams({
    action: "TEMPLATE",
    text: e.title,
    dates: `${utc(start)}/${utc(end)}`,
    ctz: TIME_ZONE,
    location: e.venue,
    details: e.url,
  });
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}
