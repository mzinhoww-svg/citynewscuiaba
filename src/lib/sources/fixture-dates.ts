/**
 * Datas relativas nas fixtures da Agenda (AGM-T7, correção 1). As páginas fictícias de eventos
 * (`tests/fixtures`) trazem datas absolutas pensadas para a semana de {@link FIXTURE_DATES_ANCHOR}.
 * Com `CRAWLER_FIXTURES_DATES=relative` (servidor de fixtures do e2e e testes de integração que
 * usam o relógio real), o `fetch` falso desloca todas as datas dessas páginas pelo mesmo número
 * de semanas inteiras: a ordem entre eventos, o "já passou" e o dia da semana ("sábado") ficam
 * iguais, e o teste não vence com o calendário. Os testes com relógio fixo leem as fixtures sem
 * deslocamento.
 */

/** Semana para a qual as datas das fixtures da Agenda foram escritas (dia de Cuiabá). */
export const FIXTURE_DATES_ANCHOR = "2026-10-08";

const DAY_MS = 86_400_000;

/**
 * Dias a somar às datas das fixtures: múltiplo de 7, nunca negativo, arredondado para cima (os
 * eventos ficam pelo menos tão à frente de `now` quanto estavam na semana-âncora).
 */
export function fixtureShiftDays(now: Date): number {
  const anchor = Date.parse(`${FIXTURE_DATES_ANCHOR}T00:00:00-04:00`);
  const days = Math.floor((now.getTime() - anchor) / DAY_MS);
  return days <= 0 ? 0 : Math.ceil(days / 7) * 7;
}

const PT_MONTHS = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];
const EN_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const NOMINAL_YEAR = Number(FIXTURE_DATES_ANCHOR.slice(0, 4));

const pad = (n: number, w = 2) => String(n).padStart(w, "0");

function shift(y: number, m: number, d: number, days: number) {
  const t = new Date(Date.UTC(y, m - 1, d) + days * DAY_MS);
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

const ISO = String.raw`\b(20\d{2})-(\d{2})-(\d{2})(?=T|\b)`;
const COMPACT = String.raw`\b(20\d{2})(\d{2})(\d{2})(?=T|\b)`;
const PT_LONG = String.raw`\b(\d{1,2}) de (${PT_MONTHS.join("|")})(?: de (20\d{2}))?\b`;
const NUMERIC = String.raw`\b(\d{2})/(\d{2})(?:/(20\d{2}))?\b`;
const RFC822 = String.raw`\b(\d{2}) (${EN_MONTHS.join("|")}) (20\d{2})\b`;
const ALL = new RegExp(`${ISO}|${COMPACT}|${PT_LONG}|${NUMERIC}|${RFC822}`, "giu");

/**
 * Desloca as datas do texto em `days` dias: ISO (`2026-10-24`, `2026-10-24T19:00`), iCal
 * (`20261024T190000`), "24 de outubro de 2026" (com ou sem ano), `24/10` e `24/10/2026`, e a data
 * de RSS (`02 Oct 2026`). Data sem ano continua sem ano. Ano solto ("Programação 2026") fica.
 */
export function shiftFixtureDates(text: string, days: number): string {
  if (days === 0) return text;
  return text.replace(ALL, (match, ...g: (string | undefined)[]) => {
    const [iy, im, id, cy, cm, cd, pd, pm, py, nd, nm, ny, rd, rm, ry] = g;
    if (iy && im && id) {
      const s = shift(Number(iy), Number(im), Number(id), days);
      return `${s.y}-${pad(s.m)}-${pad(s.d)}`;
    }
    if (cy && cm && cd) {
      if (Number(cm) > 12 || Number(cd) > 31) return match;
      const s = shift(Number(cy), Number(cm), Number(cd), days);
      return `${s.y}${pad(s.m)}${pad(s.d)}`;
    }
    if (pd && pm) {
      const month = PT_MONTHS.indexOf(pm.toLowerCase()) + 1;
      const s = shift(py ? Number(py) : NOMINAL_YEAR, month, Number(pd), days);
      return `${s.d} de ${PT_MONTHS[s.m - 1]}${py ? ` de ${s.y}` : ""}`;
    }
    if (nd && nm) {
      if (Number(nm) > 12 || Number(nd) > 31) return match;
      const s = shift(ny ? Number(ny) : NOMINAL_YEAR, Number(nm), Number(nd), days);
      return `${pad(s.d)}/${pad(s.m)}${ny ? `/${s.y}` : ""}`;
    }
    if (rd && rm && ry) {
      const s = shift(Number(ry), EN_MONTHS.indexOf(rm) + 1, Number(rd), days);
      return `${pad(s.d)} ${EN_MONTHS[s.m - 1]} ${s.y}`;
    }
    return match;
  });
}
