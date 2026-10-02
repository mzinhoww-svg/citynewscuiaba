import { neighborhoodBySlug } from "@/content/pt-BR/neighborhoods";
import { addDays, dayStart, localDateKey, localWeekday } from "@/lib/format/date";
import { firstParam, type SearchParamsInput } from "./section";

/** Filtros da agenda (P09) na URL. Valor desconhecido é descartado. */
export type AgendaWhen = "today" | "weekend" | "7d" | "30d";
export type AgendaOrigin = "official" | "organizer" | "reader";

export interface AgendaFilters {
  view: "list" | "cal";
  free: boolean;
  /** Classificação livre (crianças). */
  kids: boolean;
  category?: string;
  neighborhood?: string;
  origin?: AgendaOrigin;
  when: AgendaWhen;
  /** Um dia específico (AAAA-MM-DD), vindo do calendário. */
  day?: string;
  /** Mês do calendário (AAAA-MM). */
  month?: string;
}

export const AGENDA_CATEGORIES = [
  "cultura",
  "musica",
  "teatro",
  "cinema",
  "esporte",
  "feira",
  "gastronomia",
  "infantil",
] as const;

const WHEN_PARAM: Record<AgendaWhen, string> = {
  today: "hoje",
  weekend: "fim-de-semana",
  "7d": "7-dias",
  "30d": "30-dias",
};
const ORIGIN_PARAM: Record<AgendaOrigin, string> = {
  official: "oficial",
  organizer: "organizacao",
  reader: "leitor",
};
export const AGENDA_PARAM_VALUES = { when: WHEN_PARAM, origin: ORIGIN_PARAM } as const;

function validDay(raw: string | undefined): string | undefined {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return undefined;
  const d = new Date(`${raw}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === raw ? raw : undefined;
}

function validMonth(raw: string | undefined): string | undefined {
  if (!raw || !/^\d{4}-(0[1-9]|1[0-2])$/.test(raw)) return undefined;
  const y = Number(raw.slice(0, 4));
  return y >= 2000 && y <= 2100 ? raw : undefined;
}

function fromParam<T extends string>(
  map: Record<T, string>,
  raw: string | undefined,
): T | undefined {
  return (Object.keys(map) as T[]).find((k) => map[k] === raw);
}

export function parseAgendaFilters(sp: SearchParamsInput): AgendaFilters {
  const out: AgendaFilters = {
    view: firstParam(sp, "view") === "cal" ? "cal" : "list",
    free: firstParam(sp, "gratuito") === "1",
    kids: firstParam(sp, "criancas") === "1",
    when: fromParam(WHEN_PARAM, firstParam(sp, "quando")) ?? "30d",
  };
  const cat = firstParam(sp, "categoria");
  if (AGENDA_CATEGORIES.some((c) => c === cat)) out.category = cat;
  const bairro = neighborhoodBySlug(firstParam(sp, "bairro"));
  if (bairro) out.neighborhood = bairro.slug;
  const origin = fromParam(ORIGIN_PARAM, firstParam(sp, "origem"));
  if (origin) out.origin = origin;
  const day = validDay(firstParam(sp, "dia"));
  if (day) out.day = day;
  const month = validMonth(firstParam(sp, "mes"));
  if (month) out.month = month;
  return out;
}

export function agendaHref(f: AgendaFilters, change: Partial<AgendaFilters> = {}): string {
  const n = { ...f, ...change };
  const q = new URLSearchParams();
  if (n.view === "cal") q.set("view", "cal");
  if (n.free) q.set("gratuito", "1");
  if (n.kids) q.set("criancas", "1");
  if (n.category) q.set("categoria", n.category);
  if (n.neighborhood) q.set("bairro", n.neighborhood);
  if (n.origin) q.set("origem", ORIGIN_PARAM[n.origin]);
  if (n.when !== "30d") q.set("quando", WHEN_PARAM[n.when]);
  if (n.day) q.set("dia", n.day);
  if (n.month && n.view === "cal") q.set("mes", n.month);
  const qs = q.toString();
  return qs ? `/agenda?${qs}` : "/agenda";
}

/** Mês exibido no calendário: o da URL ou o atual em Cuiabá. */
export function calendarMonth(f: AgendaFilters, now: Date = new Date()): string {
  return f.month ?? localDateKey(now).slice(0, 7);
}

/** Intervalo [from, to) em ISO para a consulta, no fuso de Cuiabá. */
export function agendaRange(
  f: AgendaFilters,
  now: Date = new Date(),
): { from: string; to: string } {
  const iso = (d: Date) => d.toISOString();
  if (f.view === "cal") {
    const month = calendarMonth(f, now);
    const [y, m] = month.split("-").map(Number);
    const next = m === 12 ? `${(y ?? 0) + 1}-01` : `${y}-${String((m ?? 0) + 1).padStart(2, "0")}`;
    return { from: iso(dayStart(`${month}-01`)), to: iso(dayStart(`${next}-01`)) };
  }
  if (f.day) return { from: iso(dayStart(f.day)), to: iso(dayStart(addDays(f.day, 1))) };
  const today = localDateKey(now);
  switch (f.when) {
    case "today":
      return { from: iso(now), to: iso(dayStart(addDays(today, 1))) };
    case "weekend": {
      const wd = localWeekday(now);
      const saturday = wd === 6 || wd === 0 ? null : addDays(today, 6 - wd);
      const monday = addDays(today, wd === 0 ? 1 : wd === 6 ? 2 : 8 - wd);
      return {
        from: iso(saturday ? dayStart(saturday) : now),
        to: iso(dayStart(monday)),
      };
    }
    case "7d":
      return { from: iso(now), to: iso(new Date(now.getTime() + 7 * 86_400_000)) };
    case "30d":
      return { from: iso(now), to: iso(new Date(now.getTime() + 30 * 86_400_000)) };
  }
}
