import "server-only";
import { z } from "zod";
import {
  DEFAULT_REC_CONFIG,
  explainRecommendation,
  parseRecConfig,
  rankSources,
  scoreBreakdown,
  splitValid,
  variantMetrics,
  type ReaderSourceRow,
  type RecConfig,
  type ScoreComponent,
  type Weights,
} from "@/lib/ranking";
import { anonAlias } from "@/lib/ranking/pseudonym";
import { studioContext } from "@/lib/studio/context";
import { getSourceSignals } from "./sources";

/*
 * Leituras do painel de recomendação (Control Center · O17/O18; P5-T7), com a sessão da pessoa
 * (RLS: equipe lê `rec_*`; `events` só com metrics.view). O explicador usa o service role só
 * dentro do servidor e devolve apelido, nunca o id anônimo.
 */

const DAY_MS = 86_400_000;
const PAGE = 1000;
const MAX_PAGES = 20;

const WeightsJson = z.object({
  popularity: z.number(),
  individual: z.number(),
  recency: z.number(),
  engagement: z.number(),
  operational: z.number(),
  diversity: z.number(),
});

export interface WeightVersionRow {
  version: string;
  weights: Weights | null;
  cap: number;
  discoveryEvery: number;
  active: boolean;
  createdAt: string;
  proposerName: string | null;
  approverName: string | null;
  approvedBy: string | null;
  pending: boolean;
}

export interface SourceShare {
  slug: string;
  name: string;
  count: number;
  share: number;
}

const Stats = z.object({
  events: z.number().default(0),
  personalized: z.number().default(0),
  metrics_only: z.number().default(0),
  accounts: z.number().default(0),
  anonymous: z.number().default(0),
  viewed: z.number().default(0),
  clicked: z.number().default(0),
  dismissed: z.number().default(0),
  algo_versions: z.record(z.string(), z.number()).default({}),
  clicks_by_list: z.record(z.string(), z.number()).default({}),
  dismissals_by_reason: z.record(z.string(), z.number()).default({}),
});
export type PanelStats = z.infer<typeof Stats>;

export interface CurationRow {
  slug: string;
  id: string;
  name: string;
  pinned: boolean;
  excluded: boolean;
  localHighlight: boolean;
}

export interface CampaignRow {
  id: string;
  name: string;
  sourceSlugs: string[];
  startsOn: string;
  endsOn: string;
  quotaPct: number;
  audience: "todos" | "anonimos" | "contas";
  endedAt: string | null;
  clicks: number;
  sessions: number;
}

export interface ExperimentRow {
  id: string;
  name: string;
  hypothesis: string | null;
  variants: { label: string; weightsVersion: string }[];
  split: number[];
  status: "draft" | "running" | "ended";
  winner: number | null;
  startsAt: string | null;
  endedAt: string | null;
  createdAt: string;
}

export interface RecPanel {
  active: WeightVersionRow | null;
  config: RecConfig;
  history: WeightVersionRow[];
  shares: SourceShare[];
  sharesBasis: "clicks" | "sessions";
  stats: PanelStats;
  curation: CurationRow[];
  campaigns: CampaignRow[];
  experiments: ExperimentRow[];
}

const Variants = z.array(z.object({ label: z.string(), weightsVersion: z.string() }));

function mapExperiment(r: {
  id: string;
  name: string;
  hypothesis: string | null;
  variants: unknown;
  split: number[];
  status: string;
  winner: number | null;
  starts_at: string | null;
  ended_at: string | null;
  created_at: string;
}): ExperimentRow {
  const v = Variants.safeParse(r.variants);
  return {
    id: r.id,
    name: r.name,
    hypothesis: r.hypothesis,
    variants: v.success ? v.data : [],
    split: r.split.map(Number),
    status: r.status === "running" || r.status === "ended" ? r.status : "draft",
    winner: r.winner,
    startsAt: r.starts_at,
    endedAt: r.ended_at,
    createdAt: r.created_at,
  };
}

const EXPERIMENT_COLS =
  "id, name, hypothesis, variants, split, status, winner, starts_at, ended_at, created_at";

async function weightVersions(): Promise<WeightVersionRow[]> {
  const { db } = await studioContext();
  const { data, error } = await db
    .from("rec_weights")
    .select("version, weights, cap, discovery_every, active, created_at, proposed_by, approved_by")
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) throw new Error(`recomendação (pesos): ${error.message}`);
  const rows = data ?? [];
  const ids = [...new Set(rows.flatMap((r) => [r.proposed_by, r.approved_by ?? []].flat()))];
  const versions = rows.map((r) => r.version);
  const [people, approvals] = await Promise.all([
    ids.length > 0
      ? db.from("profiles").select("id, display_name").in("id", ids)
      : Promise.resolve({ data: [], error: null }),
    versions.length > 0
      ? db
          .from("approvals")
          .select("target_ref, status")
          .eq("kind", "rec.weights")
          .eq("status", "pending")
          .in("target_ref", versions)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (people.error) throw new Error(`recomendação (pessoas): ${people.error.message}`);
  if (approvals.error) throw new Error(`recomendação (aprovações): ${approvals.error.message}`);
  const names = new Map((people.data ?? []).map((p) => [p.id, p.display_name]));
  const pending = new Set((approvals.data ?? []).map((a) => a.target_ref));
  return rows.map((r) => {
    const w = WeightsJson.safeParse(r.weights);
    return {
      version: r.version,
      weights: w.success ? w.data : null,
      cap: Number(r.cap),
      discoveryEvery: r.discovery_every,
      active: r.active,
      createdAt: r.created_at,
      proposerName: names.get(r.proposed_by) ?? null,
      approverName: r.approved_by ? (names.get(r.approved_by) ?? null) : null,
      approvedBy: r.approved_by,
      pending: pending.has(r.version),
    };
  });
}

export async function getRecPanel(now: Date = new Date()): Promise<RecPanel> {
  const { db } = await studioContext();
  const since = new Date(now.getTime() - 7 * DAY_MS);
  const day = since.toISOString().slice(0, 10);
  const [history, stats, statsDaily, sources, campaigns, experiments] = await Promise.all([
    weightVersions(),
    db.rpc("rec_panel_stats", { p_since: since.toISOString() }),
    db.from("source_stats_daily").select("source_id, clicks, sessions").gte("day", day),
    db
      .from("sources")
      .select("id, slug, name, display_name, rec_pinned, rec_excluded, rec_local_highlight")
      .is("archived_at", null)
      .order("slug"),
    db
      .from("rec_campaigns")
      .select("id, name, source_slugs, starts_on, ends_on, quota_pct, audience, ended_at")
      .order("created_at", { ascending: false })
      .limit(20),
    db
      .from("rec_experiments")
      .select(EXPERIMENT_COLS)
      .order("created_at", { ascending: false })
      .limit(30),
  ]);
  for (const r of [stats, statsDaily, sources, campaigns, experiments]) {
    if (r.error) throw new Error(`recomendação: ${r.error.message}`);
  }
  const srcRows = sources.data ?? [];
  const nameOf = (s: (typeof srcRows)[number]) => s.display_name ?? s.name;
  const byId = new Map(srcRows.map((s) => [s.id, s]));

  const totals = new Map<string, { clicks: number; sessions: number }>();
  for (const d of statsDaily.data ?? []) {
    const t = totals.get(d.source_id) ?? { clicks: 0, sessions: 0 };
    t.clicks += d.clicks;
    t.sessions += d.sessions;
    totals.set(d.source_id, t);
  }
  const totalClicks = [...totals.values()].reduce((a, t) => a + t.clicks, 0);
  const sharesBasis = totalClicks > 0 ? "clicks" : "sessions";
  const counted = [...totals.entries()]
    .map(([id, t]) => ({
      src: byId.get(id),
      count: sharesBasis === "clicks" ? t.clicks : t.sessions,
    }))
    .filter((x): x is { src: (typeof srcRows)[number]; count: number } => !!x.src && x.count > 0)
    .sort((a, b) => b.count - a.count);
  const sum = counted.reduce((a, x) => a + x.count, 0);
  const shares: SourceShare[] = counted.map((x) => ({
    slug: x.src.slug ?? x.src.id,
    name: nameOf(x.src),
    count: x.count,
    share: sum > 0 ? x.count / sum : 0,
  }));

  const active = history.find((h) => h.active) ?? null;
  const config = active?.weights
    ? parseRecConfig({
        version: active.version,
        weights: active.weights,
        cap: active.cap,
        discovery_every: active.discoveryEvery,
      })
    : DEFAULT_REC_CONFIG;

  const bySlug = new Map(srcRows.map((s) => [s.slug, s]));
  const campaignRows: CampaignRow[] = await Promise.all(
    (campaigns.data ?? []).map(async (c): Promise<CampaignRow> => {
      const ids = c.source_slugs.flatMap((s) => bySlug.get(s)?.id ?? []);
      let clicks = 0;
      let sessions = 0;
      if (ids.length > 0) {
        const r = await db
          .from("source_stats_daily")
          .select("clicks, sessions")
          .in("source_id", ids)
          .gte("day", c.starts_on)
          .lte("day", c.ends_on);
        if (r.error) throw new Error(`recomendação (campanha): ${r.error.message}`);
        for (const d of r.data ?? []) {
          clicks += d.clicks;
          sessions += d.sessions;
        }
      }
      return {
        id: c.id,
        name: c.name,
        sourceSlugs: c.source_slugs,
        startsOn: c.starts_on,
        endsOn: c.ends_on,
        quotaPct: c.quota_pct,
        audience: c.audience === "anonimos" || c.audience === "contas" ? c.audience : "todos",
        endedAt: c.ended_at,
        clicks,
        sessions,
      };
    }),
  );

  const parsedStats = Stats.safeParse(stats.data);
  return {
    active,
    config,
    history,
    shares,
    sharesBasis,
    stats: parsedStats.success ? parsedStats.data : Stats.parse({}),
    curation: srcRows
      .filter((s) => s.rec_pinned || s.rec_excluded || s.rec_local_highlight)
      .map((s) => ({
        slug: s.slug ?? s.id,
        id: s.id,
        name: nameOf(s),
        pinned: s.rec_pinned,
        excluded: s.rec_excluded,
        localHighlight: s.rec_local_highlight,
      })),
    campaigns: campaignRows,
    experiments: (experiments.data ?? []).map(mapExperiment),
  };
}

/** Versões de pesos para escolher numa variante (as válidas, da mais nova para a mais antiga). */
export async function listWeightVersionNames(): Promise<string[]> {
  return (await weightVersions()).filter((v) => v.weights !== null).map((v) => v.version);
}

export async function getExperiment(id: string): Promise<ExperimentRow | null> {
  if (!/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(id)) return null;
  const { db } = await studioContext();
  const { data, error } = await db
    .from("rec_experiments")
    .select(EXPERIMENT_COLS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`recomendação (teste): ${error.message}`);
  return data ? mapExperiment(data) : null;
}

export interface ExperimentReading {
  rows: ReaderSourceRow[];
  truncated: boolean;
}

/** Eventos de recomendação, por leitor pseudonimizado e fonte, na janela do teste. */
export async function readExperimentRows(
  exp: ExperimentRow,
  now: Date,
): Promise<ExperimentReading> {
  if (!exp.startsAt || !splitValid(exp.split)) return { rows: [], truncated: false };
  const { db } = await studioContext();
  const from = exp.startsAt;
  const to = exp.endedAt ?? new Date(now.getTime() + 1000).toISOString();
  const rows: ReaderSourceRow[] = [];
  let truncated = false;
  for (let page = 0; page < MAX_PAGES; page++) {
    const { data, error } = await db
      .rpc("rec_variant_events", { p_from: from, p_to: to })
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) throw new Error(`recomendação (eventos): ${error.message}`);
    for (const r of data ?? []) {
      if (!r.anon_id) continue;
      rows.push({
        anonId: r.anon_id,
        sourceSlug: r.source_slug,
        viewed: r.viewed,
        clicked: r.clicked,
        dismissed: r.dismissed,
        firstAt: r.first_at,
        lastAt: r.last_at,
      });
    }
    if ((data?.length ?? 0) < PAGE) break;
    if (page === MAX_PAGES - 1) truncated = true;
  }
  return { rows, truncated };
}

export async function getExperimentMetrics(exp: ExperimentRow, now: Date = new Date()) {
  const { rows, truncated } = await readExperimentRows(exp, now);
  return { metrics: variantMetrics(rows, exp), truncated, hasData: rows.length > 0 };
}

export interface WhyRow {
  position: number;
  slug: string;
  name: string;
  score: number;
  reason: string;
  discovery: boolean;
  components: ScoreComponent[];
}

export interface WhyResult {
  alias: string;
  personalization: boolean;
  version: string;
  rows: WhyRow[];
}

/**
 * Como o score de cada fonte se compõe para um leitor pseudonimizado. Não há registro de
 * consentimento vigente que independa do `anon_id`: ao retirar a Personalização, os eventos novos
 * passam a vir com `anon_id` nulo (`buildEvent`), então o último evento com aquele id continua
 * dizendo "consentiu" mesmo depois da retirada (regra 7 do CLAUDE.md). Por isso o painel nunca lê
 * o histórico individual: `personalization` é sempre `false`, o id não entra na consulta de
 * sinais e o peso individual vale 0. `rec_variant_events` conta eventos anteriores à retirada.
 */
export async function explainForAnon(anonId: string, now: Date = new Date()): Promise<WhyResult> {
  await studioContext();
  const personalization = false;

  const panel = await weightVersions();
  const active = panel.find((v) => v.active && v.weights);
  const config = active?.weights
    ? parseRecConfig({
        version: active.version,
        weights: active.weights,
        cap: active.cap,
        discovery_every: active.discoveryEvery,
      })
    : DEFAULT_REC_CONFIG;

  const signals = await getSourceSignals({
    window: "7d",
    now,
  });
  if (!signals.ok) throw new Error("recomendação: sinais indisponíveis");
  const bySlug = new Map(signals.value.map((s) => [s.slug, s]));
  const ranked = rankSources(signals.value, {
    list: "recommended",
    limit: 10,
    cap: config.cap,
    discoveryEvery: config.discoveryEvery,
    hidden: [],
    weights: config.weights,
    personalization,
  });
  const rows: WhyRow[] = ranked.map((r, i) => {
    const entry = bySlug.get(r.slug);
    return {
      position: i + 1,
      slug: r.slug,
      name: entry?.name ?? r.slug,
      score: r.score,
      reason: explainRecommendation(r, {}),
      discovery: r.discovery,
      components: scoreBreakdown(r, config.weights, personalization).components,
    };
  });
  return { alias: anonAlias(anonId), personalization, version: config.version, rows };
}
