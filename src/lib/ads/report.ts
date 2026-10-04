import { DISPLAY_SLOTS, type DisplaySlot } from "./slots";

/*
 * Relatório e ocupação dos campos de banner (ADS-T4). Funções puras sobre as linhas agregadas de
 * `ad_stats` (dia × veiculação × editoria): sem identificador de pessoa, só contagens.
 */

export interface ReportRow {
  day: string;
  placementId: string;
  slot: string;
  /** `null` = peça da casa. */
  advertiser: string | null;
  creative: string;
  /** `""` = home. */
  section: string;
  impressions: number;
  views: number;
  clicks: number;
}

export interface Totals {
  impressions: number;
  views: number;
  clicks: number;
  ctr: number;
  viewRate: number;
}

export interface Group extends Totals {
  key: string;
}

export interface AdReport {
  total: Totals;
  bySlot: Group[];
  byDay: Group[];
  byAdvertiser: Group[];
  bySection: Group[];
}

export const HOUSE_ADVERTISER = "CityNews (casa)";
export const HOME_SECTION = "home";

const rate = (n: number, d: number) => (d > 0 ? n / d : 0);

function totals(impressions: number, views: number, clicks: number): Totals {
  return {
    impressions,
    views,
    clicks,
    ctr: rate(clicks, impressions),
    viewRate: rate(views, impressions),
  };
}

function groupBy(rows: readonly ReportRow[], keyOf: (r: ReportRow) => string): Group[] {
  const acc = new Map<string, [number, number, number]>();
  for (const r of rows) {
    const k = keyOf(r);
    const s = acc.get(k) ?? [0, 0, 0];
    acc.set(k, [s[0] + r.impressions, s[1] + r.views, s[2] + r.clicks]);
  }
  return [...acc].map(([key, [i, v, c]]) => ({ key, ...totals(i, v, c) }));
}

export function buildReport(rows: readonly ReportRow[]): AdReport {
  const [i, v, c] = rows.reduce(
    (s, r) => [s[0] + r.impressions, s[1] + r.views, s[2] + r.clicks],
    [0, 0, 0],
  );
  return {
    total: totals(i, v, c),
    bySlot: groupBy(rows, (r) => r.slot),
    byDay: groupBy(rows, (r) => r.day),
    byAdvertiser: groupBy(rows, (r) => r.advertiser ?? HOUSE_ADVERTISER),
    bySection: groupBy(rows, (r) => r.section || HOME_SECTION),
  };
}

/** Porcentagem em pt-BR com duas casas (`33,33%`). */
export function percent(x: number): string {
  return `${(x * 100).toFixed(2).replace(".", ",")}%`;
}

/** Célula de CSV: sem `;`/quebra solta e sem fórmula (`=`, `+`, `-`, `@` ganham `'` na frente). */
function cell(v: string | number): string {
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const CSV_HEADER = "dia;campo;anunciante;peça;editoria;impressões;visualizações;cliques;ctr";

export function reportCsv(rows: readonly ReportRow[]): string {
  const lines = rows.map((r) =>
    [
      r.day,
      r.slot,
      r.advertiser ?? HOUSE_ADVERTISER,
      r.creative,
      r.section || HOME_SECTION,
      r.impressions,
      r.views,
      r.clicks,
      percent(rate(r.clicks, r.impressions)),
    ]
      .map(cell)
      .join(";"),
  );
  return [CSV_HEADER, ...lines].join("\n") + "\n";
}

export interface OccupancyPlacement {
  slot: string;
  isHouse: boolean;
  status: string;
  startsOn: string;
  endsOn: string;
}

export interface SlotOccupancy {
  slot: DisplaySlot;
  /** `paid`: há peça paga no ar; `house`: só peças da casa; `empty`: nada no ar. */
  state: "paid" | "house" | "empty";
  paid: number;
  house: number;
  /** Veiculações pagas no ar que terminam em até 3 dias. */
  endingSoon: number;
}

const ENDING_DAYS = 3;

/** Dia de Cuiabá (UTC−4, sem horário de verão) no formato AAAA-MM-DD. */
function cuiabaDay(d: Date): string {
  return new Date(d.getTime() - 4 * 3600_000).toISOString().slice(0, 10);
}

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function slotOccupancy(
  placements: readonly OccupancyPlacement[],
  now: Date,
): SlotOccupancy[] {
  const today = cuiabaDay(now);
  const limit = addDays(today, ENDING_DAYS);
  const live = placements.filter(
    (p) => p.status === "active" && p.startsOn <= today && p.endsOn >= today,
  );
  return DISPLAY_SLOTS.map((slot) => {
    const mine = live.filter((p) => p.slot === slot);
    const paid = mine.filter((p) => !p.isHouse);
    const house = mine.length - paid.length;
    return {
      slot,
      state: paid.length > 0 ? "paid" : house > 0 ? "house" : "empty",
      paid: paid.length,
      house,
      endingSoon: paid.filter((p) => p.endsOn <= limit).length,
    };
  });
}
