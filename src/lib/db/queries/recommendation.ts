import "server-only";
import type { DbClient } from "@/lib/db/client";
import type { Json } from "@/lib/db/types";
import { parseRecConfig } from "@/lib/ranking/config";
import { REC_V1 } from "@/lib/ranking/score";
import { summarizeRecEvents, type RecEventRow, type RecMetrics } from "@/lib/ranking/metrics";
import type { RecConfig, Weights } from "@/lib/ranking/types";
import { studioContext } from "@/lib/studio/context";

/*
 * Leituras do painel de recomendação (O17) e dos testes A/B (O18) com a sessão da pessoa:
 * `rec_weights` (staff lê), campanhas e experimentos (0037) e agregados de `events` pela RLS de
 * métricas. Nada aqui devolve `anon_id`.
 */

function check(what: string, error: { message: string } | null): void {
  if (error) throw new Error(`rec ${what}: ${error.message}`);
}
const num = (v: unknown): number => (typeof v === "number" ? v : Number(v ?? 0) || 0);
const DAY_MS = 86_400_000;

export interface WeightsVersion {
  version: string;
  weights: Weights | null;
  cap: number;
  discoveryEvery: number;
  proposedBy: { id: string; name: string | null };
  approvedBy: { id: string; name: string | null } | null;
  active: boolean;
  createdAt: string;
  /** Pedido `rec.weights` desta versão, quando existe. */
  approval: { id: string; status: string; requestedBy: string } | null;
}

export interface Campaign {
  id: string;
  name: string;
  sources: { id: string; name: string; slug: string | null }[];
  startsOn: string;
  endsOn: string;
  quota: number;
  audience: string;
  clicks30d: number;
}

export interface ExperimentVariant {
  name: string;
  weightsVersion: string;
}

export interface Experiment {
  id: string;
  name: string;
  variants: ExperimentVariant[];
  split: number[];
  status: string;
  startedAt: string;
  endedAt: string | null;
  promotedVersion: string | null;
  createdBy: string | null;
}

export interface RecPanel {
  config: RecConfig;
  weights: WeightsVersion[];
  campaigns: Campaign[];
  experiments: Experiment[];
  metrics: RecMetrics;
  /** Métricas por rótulo de versão (experimentos). */
  byVersion: Map<string, RecMetrics>;
  return7d: { algoVersion: string; followed: number; returned: number }[];
  sources: { id: string; name: string; slug: string }[];
}

async function names(db: DbClient, ids: (string | null)[]): Promise<Map<string, string>> {
  const uuids = [...new Set(ids.filter((i): i is string => Boolean(i)))];
  if (uuids.length === 0) return new Map();
  const { data, error } = await db.from("profiles").select("id, display_name").in("id", uuids);
  check("profiles", error);
  return new Map((data ?? []).map((r) => [r.id, r.display_name]));
}

const toWeights = (v: Json): Weights | null => {
  const parsed = parseRecConfig({ version: "x", weights: v, cap: 0.25, discovery_every: 5 });
  return parsed.version === "x" ? parsed.weights : null;
};

function toVariants(v: Json): ExperimentVariant[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((x) =>
    typeof x === "object" && x !== null && !Array.isArray(x)
      ? [{ name: String(x.name ?? ""), weightsVersion: String(x.weightsVersion ?? "") }]
      : [],
  );
}

function toRow(r: {
  algo_version: string;
  name: string;
  list: string | null;
  reason: string | null;
  dismiss_reason: string | null;
  source_slug: string | null;
  personalization: boolean;
  account: boolean;
  n: number;
}): RecEventRow {
  return {
    algoVersion: r.algo_version,
    name: r.name,
    list: r.list,
    reason: r.reason,
    dismissReason: r.dismiss_reason,
    sourceSlug: r.source_slug,
    personalization: r.personalization,
    account: r.account,
    n: num(r.n),
  };
}

export async function weightsHistory(db: DbClient): Promise<WeightsVersion[]> {
  const [rows, approvals] = await Promise.all([
    db
      .from("rec_weights")
      .select(
        "version, weights, cap, discovery_every, proposed_by, approved_by, active, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(50),
    db
      .from("approvals")
      .select("id, target_ref, status, requested_by, created_at")
      .eq("kind", "rec.weights")
      .in("status", ["pending", "approved"])
      .order("created_at", { ascending: false }),
  ]);
  check("weights", rows.error);
  check("approvals", approvals.error);
  const byTarget = new Map<string, { id: string; status: string; requestedBy: string }>();
  for (const a of approvals.data ?? [])
    if (!byTarget.has(a.target_ref))
      byTarget.set(a.target_ref, { id: a.id, status: a.status, requestedBy: a.requested_by });
  const people = await names(
    db,
    (rows.data ?? []).flatMap((r) => [r.proposed_by, r.approved_by]),
  );
  return (rows.data ?? []).map((r) => ({
    version: r.version,
    weights: toWeights(r.weights),
    cap: num(r.cap),
    discoveryEvery: r.discovery_every,
    proposedBy: { id: r.proposed_by, name: people.get(r.proposed_by) ?? null },
    approvedBy: r.approved_by
      ? { id: r.approved_by, name: people.get(r.approved_by) ?? null }
      : null,
    active: r.active,
    createdAt: r.created_at,
    approval: byTarget.get(`rec:${r.version}`) ?? null,
  }));
}

export async function recPanel(now: Date = new Date(), db?: DbClient): Promise<RecPanel> {
  const client = db ?? (await studioContext()).db;
  const since = new Date(now.getTime() - 30 * DAY_MS).toISOString();
  const [weights, campaigns, experiments, summary, returns, sources] = await Promise.all([
    weightsHistory(client),
    client.from("rec_campaigns").select("*").order("starts_on", { ascending: false }).limit(50),
    client.from("rec_experiments").select("*").order("started_at", { ascending: false }).limit(50),
    client.rpc("rec_events_summary", { p_since: since }),
    client.rpc("rec_return_7d", { p_since: since }),
    client
      .from("sources")
      .select("id, slug, name, display_name")
      .neq("kind", "events")
      .in("status", ["active", "degraded"])
      .order("name"),
  ]);
  check("campaigns", campaigns.error);
  check("experiments", experiments.error);
  check("events", summary.error);
  check("return7d", returns.error);
  check("sources", sources.error);

  const active = weights.find((w) => w.active && w.weights);
  const config: RecConfig = active
    ? {
        version: active.version,
        weights: active.weights ?? REC_V1,
        cap: active.cap,
        discoveryEvery: active.discoveryEvery,
      }
    : parseRecConfig(null);
  const rows = (summary.data ?? []).map(toRow);
  const byVersion = new Map<string, RecMetrics>();
  for (const v of new Set(rows.map((r) => r.algoVersion)))
    byVersion.set(v, summarizeRecEvents(rows.filter((r) => r.algoVersion === v)));
  const clicksBySource = new Map<string, number>();
  for (const r of rows)
    if (r.name === "recommendation_clicked" && r.sourceSlug)
      clicksBySource.set(r.sourceSlug, (clicksBySource.get(r.sourceSlug) ?? 0) + r.n);
  const sourceList = (sources.data ?? []).map((s) => ({
    id: s.id,
    slug: s.slug,
    name: s.display_name ?? s.name,
  }));
  const sourceById = new Map(sourceList.map((s) => [s.id, s]));

  return {
    config,
    weights,
    campaigns: (campaigns.data ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      sources: c.source_ids.map((id) => {
        const s = sourceById.get(id);
        return { id, name: s?.name ?? id.slice(0, 8), slug: s?.slug ?? null };
      }),
      startsOn: c.starts_on,
      endsOn: c.ends_on,
      quota: c.quota,
      audience: c.audience,
      clicks30d: c.source_ids.reduce((acc, id) => {
        const slug = sourceById.get(id)?.slug;
        return acc + (slug ? (clicksBySource.get(slug) ?? 0) : 0);
      }, 0),
    })),
    experiments: (experiments.data ?? []).map((e) => ({
      id: e.id,
      name: e.name,
      variants: toVariants(e.variants),
      split: e.split,
      status: e.status,
      startedAt: e.started_at,
      endedAt: e.ended_at,
      promotedVersion: e.promoted_version,
      createdBy: e.created_by,
    })),
    metrics: summarizeRecEvents(rows),
    byVersion,
    return7d: (returns.data ?? []).map((r) => ({
      algoVersion: r.algo_version,
      followed: num(r.followed),
      returned: num(r.returned),
    })),
    sources: sourceList,
  };
}

export async function experimentById(id: string, db?: DbClient): Promise<Experiment | null> {
  const client = db ?? (await studioContext()).db;
  const { data, error } = await client
    .from("rec_experiments")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  check("experiment", error);
  if (!data) return null;
  return {
    id: data.id,
    name: data.name,
    variants: toVariants(data.variants),
    split: data.split,
    status: data.status,
    startedAt: data.started_at,
    endedAt: data.ended_at,
    promotedVersion: data.promoted_version,
    createdBy: data.created_by,
  };
}
