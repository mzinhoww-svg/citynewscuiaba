import { isQualifiedRead, isWeakSignal, promotesWeakSignal } from "@/lib/events/weak";
import type { SourceSignals } from "./types";
import { TIME_ZONE } from "@/lib/format/date";

/**
 * Sinais normalizados por fonte (spec §7.1; tracking-plan §3–4), a partir de dados brutos do
 * banco (T5). Puro: a query só busca linhas e chama `computeSignals`.
 *
 * - Popularidade: sessões + cliques, janela 7 dias com meia-vida de 3 dias (ou só o último dia
 *   completo na janela 1d), percentil entre as fontes.
 * - Recência: matérias nas últimas 24 h (percentil) e frescor do último item (meia-vida 12 h).
 * - Salvamentos e retornos: (salvos + compartilhados + retornos) / sessões em 7 dias, percentil.
 * - Qualidade operacional: disponibilidade de coleta em 30 dias; 3 falhas seguidas ≤ 0,2.
 * - Individual (só com leitor consentido): leituras qualificadas, seguir e salvar; sinal fraco
 *   tem peso 0 até se repetir em 3 dias diferentes. Nunca por tema sensível: só fonte e editoria.
 * - Diversidade: sem leitor, bônus para as menos acessadas; com leitor, para fontes de
 *   editorias que ele ainda não lê.
 */

export interface SourceStatsDay {
  /** AAAA-MM-DD (dia de Cuiabá). */
  day: string;
  sessions: number;
  clicks: number;
  saves: number;
  shares: number;
  returns: number;
}

export interface FetchHealth {
  ok: number;
  total: number;
  consecutiveFailures: number;
}

export interface SourceRawInput {
  slug: string;
  locality: string;
  categories: string[];
  reliability: string;
  status: string;
  pinned: boolean;
  excluded: boolean;
  localHighlight: boolean;
  /** Estatísticas diárias dos últimos 30 dias. */
  days: SourceStatsDay[];
  items24h: number;
  lastItemAt: string | null;
  fetch: FetchHealth;
}

/** Evento individual do leitor (só existe com Personalização). */
export interface ReaderEvent {
  name:
    "article_opened" | "article_read" | "article_saved" | "source_followed" | "source_unfollowed";
  sourceSlug: string;
  at: string;
  seconds?: number;
  scrollPct?: number;
}

export type TrendDirection = "up" | "stable" | "down";

export type ComputedSignals = SourceSignals & {
  /** Sessões em 30 dias; a interface só mostra aproximado (`formatReach`). */
  reach: number;
  trendDirection: TrendDirection;
};

export interface ComputeOptions {
  window: "1d" | "7d";
  now: Date;
  reader?: ReaderEvent[];
  /** Fontes seguidas conhecidas pelo servidor (conta) ou enviadas pelo navegador. */
  followed?: string[];
}

const DAY_MS = 86_400_000;
export const POPULARITY_HALF_LIFE_DAYS = 3;
const RECENCY_HALF_LIFE_HOURS = 12;
const READER_WINDOW_DAYS = 30;
const ISOLATION_DAYS = 14;
const RECENT_VISIT_DAYS = 7;
const TREND_UP = 1.15;
const TREND_DOWN = 0.85;

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

/**
 * Percentil de cada valor na lista, em [0, 1]. Zero (sem atividade) fica 0; empates dividem a
 * posição; o maior fica 1.
 */
export function percentiles(values: number[]): number[] {
  const n = values.length;
  return values.map((v) => {
    if (!(v > 0)) return 0;
    if (n === 1) return 1;
    let less = 0;
    let equal = 0;
    for (const w of values) {
      if (w < v) less++;
      else if (w === v) equal++;
    }
    return clamp01((less + (equal - 1) / 2) / (n - 1));
  });
}

/** Peso do dia com meia-vida de 3 dias; o último dia completo (ontem) vale 1. */
export function decayWeight(ageDays: number): number {
  return Math.pow(0.5, (Math.max(1, ageDays) - 1) / POPULARITY_HALF_LIFE_DAYS);
}

/** Disponibilidade de coleta; 3 falhas seguidas limitam a 0,2 e fonte degradada a 0,5. */
export function operationalScore(f: FetchHealth, status: string): number {
  let s = f.total > 0 ? f.ok / f.total : 1;
  if (f.consecutiveFailures >= 3) s = Math.min(s, 0.2);
  if (status === "degraded") s = Math.min(s, 0.5);
  return clamp01(s);
}

/** Alcance aproximado: nunca a contagem exata de leitores ("~18 mil"). */
export function formatReach(n: number): string {
  if (n < 100) return "menos de 100";
  if (n < 1000) return `~${Math.round(n / 100) * 100}`;
  const mil = Math.round(n / 1000);
  if (mil < 1000) return `~${mil} mil`;
  return `~${(n / 1_000_000).toFixed(1).replace(".", ",")} mi`;
}

const cuiabaDay = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Dias entre o dia (AAAA-MM-DD) e hoje em Cuiabá. */
function ageDays(day: string, now: Date): number {
  const today = Date.parse(`${cuiabaDay.format(now)}T00:00:00Z`);
  return Math.round((today - Date.parse(`${day}T00:00:00Z`)) / DAY_MS);
}

interface ReaderTotals {
  raw: number;
  followed: boolean;
  recentVisit: boolean;
}

/** Soma o comportamento do leitor por fonte, com a regra de sinal fraco. */
function readerTotals(
  events: ReaderEvent[],
  known: Set<string>,
  now: Date,
): Map<string, ReaderTotals> {
  const since = now.getTime() - READER_WINDOW_DAYS * DAY_MS;
  const bySource = new Map<string, ReaderEvent[]>();
  for (const e of events) {
    const t = Date.parse(e.at);
    if (!known.has(e.sourceSlug) || Number.isNaN(t) || t < since || t > now.getTime()) continue;
    bySource.set(e.sourceSlug, [...(bySource.get(e.sourceSlug) ?? []), e]);
  }
  const out = new Map<string, ReaderTotals>();
  for (const [slug, list] of bySource) {
    const isolationCut = now.getTime() - ISOLATION_DAYS * DAY_MS;
    const interactions = list.filter(
      (e) => e.name !== "source_unfollowed" && Date.parse(e.at) >= isolationCut,
    ).length;
    const isolated = interactions <= 1;
    let strong = 0;
    const weakAt: string[] = [];
    let follows = 0;
    for (const e of list) {
      switch (e.name) {
        case "article_read": {
          const seconds = e.seconds ?? 0;
          const scrollPct = e.scrollPct ?? 0;
          if (
            isQualifiedRead(seconds, scrollPct) &&
            !isWeakSignal({ seconds, scrollPct, isolated })
          )
            strong += 1;
          else weakAt.push(e.at);
          break;
        }
        case "article_opened":
          weakAt.push(e.at);
          break;
        case "article_saved":
          strong += 1.5;
          break;
        case "source_followed":
          follows += 1;
          break;
        case "source_unfollowed":
          follows = Math.max(0, follows - 1);
          break;
      }
    }
    const weak = promotesWeakSignal(weakAt) ? weakAt.length * 0.25 : 0;
    const recentCut = now.getTime() - RECENT_VISIT_DAYS * DAY_MS;
    out.set(slug, {
      raw: strong + follows * 2 + weak,
      followed: follows > 0,
      recentVisit: list.some(
        (e) =>
          (e.name === "article_opened" || e.name === "article_read") &&
          Date.parse(e.at) >= recentCut,
      ),
    });
  }
  return out;
}

export function computeSignals(rows: SourceRawInput[], opts: ComputeOptions): ComputedSignals[] {
  const { now } = opts;
  const maxAge = opts.window === "1d" ? 1 : 7;

  const popularityRaw: number[] = [];
  const trendRatio: number[] = [];
  const engagementRaw: number[] = [];
  const reach: number[] = [];
  const directions: TrendDirection[] = [];
  for (const r of rows) {
    let pop = 0;
    let recent = 0;
    let prev = 0;
    let sessions7 = 0;
    let engaged7 = 0;
    let sessions30 = 0;
    for (const d of r.days) {
      const age = ageDays(d.day, now);
      if (age < 0 || age > 30) continue;
      const volume = d.sessions + d.clicks;
      sessions30 += d.sessions;
      if (age <= maxAge) pop += decayWeight(age) * volume;
      if (age >= 1 && age <= 3) recent += volume;
      if (age >= 4 && age <= 7) prev += volume;
      if (age <= 7) {
        sessions7 += d.sessions;
        engaged7 += d.saves + d.shares + d.returns;
      }
    }
    const recentAvg = recent / 3;
    const prevAvg = prev / 4;
    const ratio = prevAvg > 0 ? recentAvg / prevAvg : recentAvg > 0 ? 2 : 1;
    popularityRaw.push(pop);
    trendRatio.push(recent + prev > 0 ? ratio : 0);
    engagementRaw.push(sessions7 > 0 ? engaged7 / sessions7 : 0);
    reach.push(sessions30);
    directions.push(ratio >= TREND_UP ? "up" : ratio <= TREND_DOWN ? "down" : "stable");
  }

  const popularity = percentiles(popularityRaw);
  const trend = percentiles(trendRatio);
  const engagement = percentiles(engagementRaw);
  const items = percentiles(rows.map((r) => r.items24h));

  const reader = readerSignals(
    rows.map((r, i) => ({ slug: r.slug, categories: r.categories, popularity: popularity[i]! })),
    { reader: opts.reader, followed: opts.followed, now },
  );

  return rows.map((r, i) => {
    const hoursSinceLast = r.lastItemAt
      ? Math.max(0, (now.getTime() - Date.parse(r.lastItemAt)) / 3_600_000)
      : Number.POSITIVE_INFINITY;
    const freshness = Number.isFinite(hoursSinceLast)
      ? Math.pow(0.5, hoursSinceLast / RECENCY_HALF_LIFE_HOURS)
      : 0;
    const mine = reader[i]!;
    return {
      slug: r.slug,
      locality: r.locality,
      popularity: popularity[i]!,
      individual: mine.individual,
      recency: clamp01(0.5 * items[i]! + 0.5 * freshness),
      engagement: engagement[i]!,
      operational: operationalScore(r.fetch, r.status),
      diversity: mine.diversity,
      trend: trend[i]!,
      followed: mine.followed,
      pinned: r.pinned,
      excluded: r.excluded,
      blocked: r.status === "blocked",
      isNewForUser: mine.isNewForUser,
      localHighlight: r.localHighlight,
      verified: r.reliability === "verified" || r.reliability === "primary",
      recentVisit: mine.recentVisit,
      similar: mine.similar,
      reach: reach[i]!,
      trendDirection: directions[i]!,
    };
  });
}

/** Sinais de uma fonte que dependem do leitor. */
export interface ReaderSignals {
  individual: number;
  diversity: number;
  followed: boolean;
  isNewForUser: boolean;
  recentVisit: boolean;
  similar: boolean;
}

/**
 * Parte individual dos sinais (com Personalização): comportamento do leitor por fonte com a
 * regra de sinal fraco, diversidade pelas editorias que ele ainda não lê e fontes seguidas.
 * Sem eventos do leitor, individual = 0 e a diversidade favorece as fontes menos acessadas.
 * Usada no servidor (eventos com `anonId`) e no navegador (histórico local, P2-T7).
 */
export function readerSignals(
  rows: { slug: string; categories: string[]; popularity: number }[],
  opts: { reader?: ReaderEvent[]; followed?: string[]; now: Date },
): ReaderSignals[] {
  const known = new Set(rows.map((r) => r.slug));
  const reader = opts.reader
    ? readerTotals(opts.reader, known, opts.now)
    : new Map<string, ReaderTotals>();
  const readerRaw = rows.map((r) => reader.get(r.slug)?.raw ?? 0);
  const individual = percentiles(readerRaw);
  const hasReader = readerRaw.some((v) => v > 0);

  // Editorias que o leitor já lê (peso pelo comportamento), para diversidade e "semelhante".
  const categoryWeight = new Map<string, number>();
  let categoryTotal = 0;
  rows.forEach((r, i) => {
    const v = readerRaw[i]!;
    if (v <= 0) return;
    for (const c of r.categories) {
      categoryWeight.set(c, (categoryWeight.get(c) ?? 0) + v);
      categoryTotal += v;
    }
  });
  const followed = new Set(opts.followed ?? []);

  return rows.map((r, i) => {
    const mine = reader.get(r.slug);
    const reads = readerRaw[i]! > 0;
    const maxShare =
      categoryTotal > 0
        ? Math.max(0, ...r.categories.map((c) => (categoryWeight.get(c) ?? 0) / categoryTotal))
        : 0;
    const diversity = hasReader ? (reads ? 0 : 1 - maxShare) : 1 - r.popularity;
    const isFollowed = followed.has(r.slug) || (mine?.followed ?? false);
    return {
      individual: individual[i]!,
      diversity: clamp01(diversity),
      followed: isFollowed,
      isNewForUser: !reads && !isFollowed,
      recentVisit: mine?.recentVisit ?? false,
      similar: hasReader && !reads && maxShare > 0,
    };
  });
}
