/**
 * Datas do portal no fuso de Cuiabá (P1 Global Constraints): relativas até 24 h ("há 12 min"),
 * depois absolutas ("27/09/2026, 9h12"). Horas no formato da marca: "19h", "20h30".
 */
export const TIME_ZONE = "America/Cuiaba";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const partsFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: TIME_ZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const monthFormatter = new Intl.DateTimeFormat("pt-BR", { timeZone: TIME_ZONE, month: "short" });

function parse(iso: string): Date | null {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parts(d: Date): Record<"day" | "month" | "year" | "hour" | "minute", string> {
  const out = { day: "", month: "", year: "", hour: "", minute: "" };
  for (const p of partsFormatter.formatToParts(d)) {
    if (p.type in out) out[p.type as keyof typeof out] = p.value;
  }
  return out;
}

function hourText(hour: string, minute: string): string {
  const h = String(Number(hour));
  return minute === "00" ? `${h}h` : `${h}h${minute}`;
}

/** "19h" ou "20h30" no fuso de Cuiabá. */
export function formatHour(iso: string): string {
  const d = parse(iso);
  if (!d) return "";
  const p = parts(d);
  return hourText(p.hour, p.minute);
}

/** "4 out" no fuso de Cuiabá. */
export function formatDayMonth(iso: string): string {
  const d = parse(iso);
  if (!d) return "";
  const month = monthFormatter.format(d).replace(".", "");
  return `${Number(parts(d).day)} ${month}`;
}

/** Relativo até 24 h no passado; absoluto no resto. Data inválida vira texto vazio. */
export function formatWhen(iso: string, now: Date = new Date()): string {
  const d = parse(iso);
  if (!d) return "";
  const diff = now.getTime() - d.getTime();
  if (diff >= 0 && diff < DAY) {
    if (diff < MINUTE) return "agora";
    if (diff < HOUR) return `há ${Math.floor(diff / MINUTE)} min`;
    return `há ${Math.floor(diff / HOUR)} h`;
  }
  const p = parts(d);
  return `${p.day}/${p.month}/${p.year}, ${hourText(p.hour, p.minute)}`;
}

/** Minutos até o próximo ciclo do motor (a cada 30 min, em :00 e :30). */
export function nextCycleMinutes(now: Date = new Date()): number {
  const cycle = 30 * MINUTE;
  const remaining = cycle - (now.getTime() % cycle);
  return Math.ceil(remaining / MINUTE);
}

const longFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: TIME_ZONE,
  weekday: "long",
  day: "numeric",
  month: "long",
});

/** "domingo, 27 de setembro" no fuso de Cuiabá. */
export function formatLongDate(iso: string): string {
  const d = parse(iso);
  return d ? longFormatter.format(d) : "";
}

/**
 * Diferença (em minutos) entre o relógio de Cuiabá e o UTC no instante `d` (−240 hoje; o
 * cálculo não assume o valor, caso volte o horário de verão).
 */
export function zoneOffsetMinutes(d: Date): number {
  const p = parts(d);
  const asUtc = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour),
    Number(p.minute),
  );
  const truncated = d.getTime() - (d.getTime() % MINUTE);
  return Math.round((asUtc - truncated) / MINUTE);
}

/** Data local de Cuiabá como "2026-10-03" (agrupar por dia, links de calendário). */
export function localDateKey(iso: string | Date): string {
  const d = typeof iso === "string" ? parse(iso) : iso;
  if (!d) return "";
  const p = parts(d);
  return `${p.year}-${p.month}-${p.day}`;
}

/** Instante da meia-noite de Cuiabá do dia de `now`. */
export function startOfDay(now: Date = new Date()): Date {
  const [y, m, day] = localDateKey(now).split("-").map(Number);
  const midnightUtc = Date.UTC(y ?? 1970, (m ?? 1) - 1, day ?? 1);
  return new Date(midnightUtc - zoneOffsetMinutes(now) * MINUTE);
}

/** ISO com o deslocamento de Cuiabá: "2026-10-03T20:00:00-04:00" (JSON-LD de evento). */
export function toZonedIso(iso: string): string {
  const d = parse(iso);
  if (!d) return "";
  const p = parts(d);
  const off = zoneOffsetMinutes(d);
  const sign = off < 0 ? "-" : "+";
  const abs = Math.abs(off);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  const sec = String(d.getUTCSeconds()).padStart(2, "0");
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${sec}${sign}${hh}:${mm}`;
}

/** "25/09/2026, 12h" sempre absoluto (datas de publicação e de versão). */
export function formatDateTime(iso: string): string {
  const d = parse(iso);
  if (!d) return "";
  const p = parts(d);
  return `${p.day}/${p.month}/${p.year}, ${hourText(p.hour, p.minute)}`;
}

/** Instante da meia-noite de Cuiabá do dia "2026-10-03". */
export function dayStart(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  const guess = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1, 12));
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1) - zoneOffsetMinutes(guess) * MINUTE);
}

/** Dia da semana em Cuiabá (0 = domingo). */
export function localWeekday(d: Date): number {
  return new Date(`${localDateKey(d)}T12:00:00Z`).getUTCDay();
}

/** Soma dias a uma data local "AAAA-MM-DD". */
export function addDays(key: string, n: number): string {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const monthYearFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "UTC",
  month: "long",
  year: "numeric",
});

/** "outubro de 2026" a partir de "2026-10". */
export function formatMonthYear(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return monthYearFormatter.format(new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, 15)));
}

/** "25/09/2026" (data sem hora, no fuso de Cuiabá). Aceita "AAAA-MM-DD" (dia local). */
export function formatDate(isoOrKey: string): string {
  const d = parse(/^\d{4}-\d{2}-\d{2}$/.test(isoOrKey) ? `${isoOrKey}T12:00:00-04:00` : isoOrKey);
  if (!d) return "";
  const p = parts(d);
  return `${p.day}/${p.month}/${p.year}`;
}
