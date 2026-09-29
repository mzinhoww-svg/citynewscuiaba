import "server-only";
import type { DbClient } from "@/lib/db/client";
import {
  computeSignals,
  DEFAULT_REC_CONFIG,
  parseRecConfig,
  type ReaderEvent,
  type RecConfig,
  type SourceRawInput,
} from "@/lib/ranking";
import type { Result } from "@/lib/result";
import { fetchAggregated } from "./aggregated";
import { assignVariant, experimentVersion } from "@/lib/ranking/experiments";
import { many, one, readPublic, readService } from "./run";
import type { AggregatedView, QueryError, SourceEntry } from "./types";

/** Fontes que o leitor pode ver e seguir: coletando ou degradadas (pausada e bloqueada, não). */
const VISIBLE_STATUSES = ["active", "degraded"] as const;
const READER_EVENTS: ReaderEvent["name"][] = [
  "article_opened",
  "article_read",
  "article_saved",
  "source_followed",
  "source_unfollowed",
];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY_MS = 86_400_000;

export const SOURCE_LOCALITIES = ["cuiaba", "mt", "nacional"] as const;
export type SourceLocality = (typeof SOURCE_LOCALITIES)[number];

export interface SourceSignalsQuery {
  window: "1d" | "7d";
  /** Cuiabá inclui Várzea Grande (Baixada Cuiabana). */
  locality?: SourceLocality;
  category?: string;
  /** Só com Personalização: comportamento individual deste navegador. */
  anonId?: string;
  /** Fontes seguidas conhecidas (perfil local ou conta). */
  followed?: string[];
  now?: Date;
}

const cuiabaDay = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Cuiaba",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

function matchesLocality(locality: string, wanted: SourceLocality | undefined): boolean {
  if (!wanted) return true;
  if (wanted === "cuiaba") return locality === "cuiaba" || locality === "varzea-grande";
  return locality === wanted;
}

async function fetchEntries(db: DbClient, q: SourceSignalsQuery): Promise<SourceEntry[]> {
  const now = q.now ?? new Date();
  const since30 = cuiabaDay.format(new Date(now.getTime() - 31 * DAY_MS));
  const anonId = q.anonId && UUID.test(q.anonId) ? q.anonId : null;

  const [sources, stats, items, health, reader] = await Promise.all([
    db
      .from("sources")
      .select(
        "id, slug, name, display_name, base_url, categories, locality, reliability, status, rec_pinned, rec_excluded, rec_local_highlight, last_fetched_at",
      )
      .in("status", [...VISIBLE_STATUSES])
      .order("slug")
      .then(many),
    db
      .from("source_stats_daily")
      .select("day, source_id, sessions, clicks, saves, shares, returns")
      .gte("day", since30)
      .then(many),
    db
      .from("source_item_stats")
      .select("source_id, items_24h, items_today, last_item_at")
      .then(many),
    db.from("source_fetch_health").select("slug, ok, total, consecutive_failures").then(many),
    anonId
      ? db
          .from("events")
          .select("name, source_slug, at, props")
          .eq("anon_id", anonId)
          .in("name", READER_EVENTS)
          .not("source_slug", "is", null)
          .gte("received_at", new Date(now.getTime() - 30 * DAY_MS).toISOString())
          .limit(2000)
          .then(many)
      : Promise.resolve([]),
  ]);

  const statsBy = new Map<string, SourceRawInput["days"]>();
  for (const s of stats) {
    const list = statsBy.get(s.source_id) ?? [];
    list.push({
      day: s.day,
      sessions: s.sessions,
      clicks: s.clicks,
      saves: s.saves,
      shares: s.shares,
      returns: s.returns,
    });
    statsBy.set(s.source_id, list);
  }
  const itemsBy = new Map(items.map((i) => [i.source_id, i]));
  const healthBy = new Map(health.map((h) => [h.slug, h]));

  const raw: SourceRawInput[] = sources.map((s) => {
    const h = s.slug ? healthBy.get(s.slug) : undefined;
    const it = itemsBy.get(s.id);
    return {
      slug: s.slug,
      locality: s.locality,
      categories: s.categories,
      reliability: s.reliability,
      status: s.status,
      pinned: s.rec_pinned,
      excluded: s.rec_excluded,
      localHighlight: s.rec_local_highlight,
      days: statsBy.get(s.id) ?? [],
      items24h: it?.items_24h ?? 0,
      lastItemAt: it?.last_item_at ?? null,
      fetch: {
        ok: h?.ok ?? 0,
        total: h?.total ?? 0,
        consecutiveFailures: h?.consecutive_failures ?? 0,
      },
    };
  });

  const readerEvents: ReaderEvent[] = reader.flatMap((e) => {
    if (!e.source_slug || !READER_EVENTS.includes(e.name as ReaderEvent["name"])) return [];
    const props = e.props && typeof e.props === "object" && !Array.isArray(e.props) ? e.props : {};
    return [
      {
        name: e.name as ReaderEvent["name"],
        sourceSlug: e.source_slug,
        at: e.at,
        seconds: num(props.seconds),
        scrollPct: num(props.scrollPct),
      },
    ];
  });

  const signals = computeSignals(raw, {
    window: q.window,
    now,
    reader: anonId ? readerEvents : undefined,
    followed: q.followed,
  });

  return sources
    .map((s, i): SourceEntry => {
      const it = itemsBy.get(s.id);
      return {
        ...signals[i]!,
        id: s.id,
        name: s.display_name ?? s.name,
        href: `/fontes/${s.slug}`,
        baseUrl: s.base_url,
        categories: s.categories,
        reliability: s.reliability,
        itemsToday: it?.items_today ?? 0,
        lastUpdatedAt: it?.last_item_at ?? s.last_fetched_at,
      };
    })
    .filter(
      (s) =>
        matchesLocality(s.locality, q.locality) &&
        (!q.category || s.categories.includes(q.category)),
    );
}

/**
 * Sinais de todas as fontes visíveis, normalizados por percentil na janela (7 d com meia-vida de
 * 3 dias, ou 1 d). Filtros de localidade e editoria são aplicados depois da normalização.
 * Sem `anonId` (ou sem Personalização), `individual` é 0 para todas.
 */
export async function getSourceSignals(
  q: SourceSignalsQuery,
): Promise<Result<SourceEntry[], QueryError>> {
  return readService((db) => fetchEntries(db, q));
}

/** Uma fonte visível com seus sinais (página da fonte, P2-T8). */
export async function getSource(
  slug: string,
  q: Omit<SourceSignalsQuery, "locality" | "category"> = { window: "7d" },
): Promise<Result<SourceEntry | null, QueryError>> {
  return readService(async (db) => {
    const all = await fetchEntries(db, q);
    return all.find((s) => s.slug === slug) ?? null;
  });
}

/** Itens agregados recentes da fonte (sempre com link para o original). */
export async function listSourceItems(
  slug: string,
  section?: string,
  limit = 20,
): Promise<Result<AggregatedView[], QueryError>> {
  return readPublic((db) => fetchAggregated(db, { sourceSlugs: [slug], section, limit }));
}

/**
 * Pesos ativos de `rec_weights` (seed `rec-v1`). Banco fora, sem variáveis ou registro inválido:
 * padrões da spec. Nunca falha.
 */
export async function getRecConfig(): Promise<RecConfig> {
  const r = await readService(async (db) =>
    db
      .from("rec_weights")
      .select("version, weights, cap, discovery_every")
      .eq("active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(one),
  );
  return r.ok ? parseRecConfig(r.value) : DEFAULT_REC_CONFIG;
}

/**
 * Configuração para um leitor dentro de um teste A/B em andamento (P5-T7): a variante é
 * estável por `anonId` (`assignVariant`) e a versão vira o rótulo `<base>+<exp>:<variante>`
 * gravado nos eventos. Sem experimento, sem `anonId` ou com versão inválida, a configuração
 * ativa. Nunca falha.
 */
export async function getRecConfigFor(anonId: string | null): Promise<RecConfig> {
  const base = await getRecConfig();
  if (!anonId || !UUID.test(anonId)) return base;
  const r = await readService(async (db) => {
    const exp = await db
      .from("rec_experiments")
      .select("id, variants, split")
      .eq("status", "running")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(one);
    if (!exp || !Array.isArray(exp.variants)) return null;
    const variant = assignVariant(anonId, { id: exp.id, split: exp.split });
    const chosen = exp.variants[variant];
    const version =
      typeof chosen === "object" && chosen !== null && !Array.isArray(chosen)
        ? String(chosen.weightsVersion ?? "")
        : "";
    if (!version) return null;
    const row = await db
      .from("rec_weights")
      .select("version, weights, cap, discovery_every")
      .eq("version", version)
      .maybeSingle()
      .then(one);
    if (!row) return null;
    const cfg = parseRecConfig(row);
    return { ...cfg, version: experimentVersion(base.version, exp.id, variant) };
  });
  return r.ok && r.value ? r.value : base;
}

/** Página da fonte (P15): sinais do card e a ficha "Sobre esta fonte no CityNews". */
export interface SourceDetail extends SourceEntry {
  kind: string;
  /** Cadência efetiva: a da fonte ou, quando `null` (segue o padrão), a global (`app_settings`). */
  frequencyMinutes: number;
  republishPolicy: "link_only" | "summary_2_sentences";
  imagePolicy: "none" | "with_agreement" | "licensed_only" | "reproduction";
  agreementUntil: string | null;
  /** Coletas bem-sucedidas / total em 30 dias (`null` sem histórico de coleta). */
  availability: number | null;
}

const FALLBACK_DEFAULT_FREQUENCY = 30;

function defaultFrequency(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 30
    ? value
    : FALLBACK_DEFAULT_FREQUENCY;
}

export async function getSourceDetail(
  slug: string,
): Promise<Result<SourceDetail | null, QueryError>> {
  return readService(async (db) => {
    const [all, meta, health, defaults] = await Promise.all([
      fetchEntries(db, { window: "7d" }),
      db
        .from("sources")
        .select("kind, frequency_minutes, republish_policy, image_policy, agreement_until")
        .eq("slug", slug)
        .in("status", [...VISIBLE_STATUSES])
        .maybeSingle()
        .then(one),
      db.from("source_fetch_health").select("ok, total").eq("slug", slug).maybeSingle().then(one),
      db
        .from("app_settings")
        .select("value")
        .eq("key", "sources.default_frequency_minutes")
        .maybeSingle()
        .then(one),
    ]);
    const entry = all.find((s) => s.slug === slug);
    if (!entry || !meta) return null;
    const ok = health?.ok ?? 0;
    const total = health?.total ?? 0;
    return {
      ...entry,
      kind: meta.kind,
      frequencyMinutes: meta.frequency_minutes ?? defaultFrequency(defaults?.value),
      republishPolicy: meta.republish_policy,
      imagePolicy: meta.image_policy,
      agreementUntil: meta.agreement_until,
      availability: total > 0 ? ok / total : null,
    };
  });
}
