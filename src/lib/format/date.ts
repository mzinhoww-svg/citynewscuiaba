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
