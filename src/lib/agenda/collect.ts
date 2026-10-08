import { collectAiPage } from "./collect-ai";
import {
  ACCEPT,
  createRunCtx,
  emptyReport,
  accept,
  fetchDetail,
  robotsGate,
  timedGet,
  type CollectDeps,
  type CollectReport,
  type RobotsGate,
  type RunCtx,
  type SourceReport,
  type StoredCollected,
} from "./collect-context";
import { extractIcal } from "./extract/ical";
import { extractJsonLd } from "./extract/jsonld";
import { extractRss } from "./extract/rss";
import { extractSympla } from "./extract/sympla";
import { extractTribe } from "./extract/tribe";
import { attachImages } from "./images";
import { reconcile } from "./reconcile";
import type { AgendaSource, NormalizedEvent, RawEvent } from "./types";
import { matchVenue, type VenueCandidate } from "./venue-match";
import type { FetchOutcome } from "@/lib/sources/status";

export {
  AI_DEADLINE_MS,
  AI_HARD_DEADLINE_MS,
  type CollectDeps,
  type CollectReport,
  type ExistingEvent,
  type ExtractCache,
  type PreviewItem,
  type RejectedSample,
  type SourceReport,
  type SourceStatus,
  type StoredCollected,
} from "./collect-context";

/** API Tribe: até 3 páginas de 50 eventos por execução. */
const TRIBE_MAX_PAGES = 3;
const TRIBE_PER_PAGE = "50";

interface SourceResult {
  report: SourceReport;
  events: NormalizedEvent[];
  /** Resultado da busca para `sourceState` (ausente: não mexe no estado). */
  outcome?: { outcome: FetchOutcome; detail?: string };
}

function extractStructured(source: AgendaSource, body: string, now: Date): RawEvent[] {
  switch (source.kind) {
    case "jsonld":
      return extractJsonLd(body);
    case "ical":
      return extractIcal(body);
    case "rss":
      return extractRss(body, now);
    case "sympla":
      return extractSympla(body);
    case "tribe":
    case "ai_page":
      return [];
  }
}

/** Tribe: segue `next_rest_url` do mesmo host até 3 páginas; `false` = corte de prazo no meio. */
async function collectTribe(
  source: AgendaSource,
  ctx: RunCtx,
  report: SourceReport,
  firstUrl: string,
  firstBody: string,
  robots: RobotsGate,
  events: NormalizedEvent[],
): Promise<boolean> {
  let body = firstBody;
  let pageUrl = firstUrl;
  const seen = new Set<string>();
  for (let page = 1; ; page++) {
    const { events: raws, next } = extractTribe(body);
    report.found += raws.length;
    for (const raw of raws) accept(raw, source, ctx, report, events, {}, { url: pageUrl, body });
    if (!next || page >= TRIBE_MAX_PAGES || seen.has(next)) return true;
    seen.add(next);
    let nextUrl: URL;
    try {
      nextUrl = new URL(next);
    } catch {
      return true;
    }
    // Só segue páginas do mesmo site; erro no meio encerra a paginação e mantém o que veio.
    if (nextUrl.host !== new URL(source.url).host) return true;
    const verdict = await robots(nextUrl.href);
    if (verdict.kind === "deadline") return false;
    if (verdict.kind !== "allowed") return true;
    const res = await timedGet(ctx, source, nextUrl.href, ACCEPT.tribe);
    if (res.kind === "deadline") return false;
    if (res.kind !== "ok") return true;
    body = res.body;
    pageUrl = nextUrl.href;
  }
}

async function collectSource(source: AgendaSource, ctx: RunCtx): Promise<SourceResult> {
  const report = emptyReport(source);
  const events: NormalizedEvent[] = [];
  const aiPage = source.kind === "ai_page";
  /** Adiada: não grava nada desta fonte (nada pela metade) e não conta falha. */
  const deferred = (detail: string, outcome?: SourceResult["outcome"]): SourceResult => ({
    report: { ...report, status: aiPage ? "ia_adiada" : "adiada", detail, approved: 0 },
    events: [],
    outcome,
  });
  if (aiPage && ctx.budget <= 0) return deferred("teto de páginas");
  const robots = robotsGate(ctx, source);
  const verdict = await robots(source.url);
  if (verdict.kind === "deadline") return deferred("prazo da execução");
  if (verdict.kind === "disallowed")
    return { report: { ...report, status: "robots", detail: verdict.reason }, events };
  if (verdict.kind === "rate_limited")
    return {
      report: { ...report, status: "indisponivel", detail: "limite por hora" },
      events,
      outcome: { outcome: "rate_limited" },
    };
  if (verdict.kind === "unavailable")
    return {
      report: { ...report, status: "indisponivel", detail: verdict.reason },
      events,
      outcome: { outcome: "failed", detail: verdict.reason },
    };

  if (aiPage) {
    const r = await collectAiPage(source, ctx, report, robots, events);
    if (r.kind === "deferred") return deferred(r.detail, r.fetched ? { outcome: "ok" } : undefined);
    if (r.kind === "failed")
      return {
        report: { ...report, status: "erro", detail: r.detail },
        events: [],
        outcome: { outcome: "failed", detail: r.detail },
      };
    report.approved = events.length;
    return { report, events, outcome: { outcome: "ok" } };
  }

  let url = source.url;
  if (source.kind === "tribe") {
    const u = new URL(source.url);
    if (!u.searchParams.has("per_page")) u.searchParams.set("per_page", TRIBE_PER_PAGE);
    url = u.href;
  }
  const res = await timedGet(ctx, source, url, ACCEPT[source.kind]);
  if (res.kind === "deadline") return deferred("prazo da execução");
  if (res.kind === "rate_limited")
    return {
      report: { ...report, status: "indisponivel", detail: "limite por hora" },
      events,
      outcome: { outcome: "rate_limited" },
    };
  if (res.kind !== "ok") {
    const detail = fetchDetail(res);
    return {
      report: { ...report, status: "erro", detail },
      events,
      outcome: { outcome: "failed", detail },
    };
  }
  if (source.kind === "tribe") {
    if (!(await collectTribe(source, ctx, report, url, res.body, robots, events)))
      return deferred("prazo da execução", { outcome: "ok" });
  } else {
    const raws = extractStructured(source, res.body, ctx.now);
    report.found += raws.length;
    for (const raw of raws) accept(raw, source, ctx, report, events, {}, { url, body: res.body });
  }
  report.approved = events.length;
  return { report, events, outcome: { outcome: "ok" } };
}

/**
 * Vínculo com o lugar do Guia (ARD-T3): só evento sem `venueId` e sem `venue_id` travado pela
 * redação; casamento pelo local final (depois de travas e confirmação). Lugares lidos uma vez;
 * falha na leitura não derruba a coleta (segue sem vínculo).
 */
async function linkVenues(
  events: NormalizedEvent[],
  stored: readonly StoredCollected[],
  load: (() => Promise<VenueCandidate[]>) | undefined,
): Promise<NormalizedEvent[]> {
  if (!load || !events.some((e) => e.venueId === null)) return events;
  let venues: VenueCandidate[];
  try {
    venues = await load();
  } catch (e) {
    console.warn("agenda: lugares do Guia indisponíveis, coleta segue sem vínculo", {
      message: e instanceof Error ? e.message : String(e),
    });
    return events;
  }
  const locked = new Set(
    stored.filter((s) => s.lockedFields.includes("venue_id")).map((s) => s.dedupeKey),
  );
  return events.map((e) =>
    e.venueId === null && !locked.has(e.dedupeKey)
      ? { ...e, venueId: matchVenue(e.venue, venues) }
      : e,
  );
}

/**
 * Coleta da Agenda: para cada fonte ativa (robots.txt respeitado, limite por hora, uma fonte
 * que falha não derruba as outras) extrai — estruturado ou pela leitura da página (`ai_page`,
 * com cache, teto e prazo) —, normaliza, aprova, reconcilia com o banco (`reconcile.ts`) e grava.
 * Estruturadas rodam antes das `ai_page`; depois do corte de 45 s nada novo começa e a fonte fica
 * adiada (`adiada`/`ia_adiada`), sem gravar pela metade.
 */
export async function collectAgenda(deps: CollectDeps): Promise<CollectReport> {
  const ctx = createRunCtx(deps);
  const now = ctx.now;
  const only = deps.onlySourceId;
  const selected = only
    ? deps.sources.filter((s) => s.id === only || s.uuid === only)
    : deps.sources.filter((s) => s.enabled);

  // Estruturadas primeiro (rápidas, sem modelo); relatório e duplicidade na ordem das fontes.
  const results = new Map<AgendaSource, SourceResult>();
  const order = [
    ...selected.filter((s) => s.kind !== "ai_page"),
    ...selected.filter((s) => s.kind === "ai_page"),
  ];
  for (const source of order) {
    let result: SourceResult;
    try {
      result = await collectSource(source, ctx);
    } catch (e) {
      result = {
        report: {
          ...emptyReport(source),
          status: "erro",
          detail: e instanceof Error ? e.message : String(e),
        },
        events: [],
      };
    }
    results.set(source, result);
    if (result.outcome && !deps.dryRun)
      await deps.sourceState(source.uuid, result.outcome.outcome, result.outcome.detail);
  }
  const reports: SourceReport[] = [];
  const all: NormalizedEvent[] = [];
  for (const source of selected) {
    const result = results.get(source);
    if (!result) continue;
    reports.push(result.report);
    all.push(...result.events);
  }

  const stored = all.length > 0 ? await deps.stored([...new Set(all.map((e) => e.dedupeKey))]) : [];
  const rec = reconcile(all, stored, await deps.existing());
  for (const r of reports) {
    r.confirmed += rec.confirmed.get(r.id) ?? 0;
    r.new += rec.created.get(r.id) ?? 0;
    r.updated += rec.updated.get(r.id) ?? 0;
  }
  // Imagem só na execução real (o ensaio não grava nada no Media Registry), depois das travas.
  // Lugar do Guia também só na execução real (o ensaio não lê nem grava vínculo).
  const toSave = deps.dryRun
    ? rec.toSave
    : await linkVenues(
        await attachImages(rec.toSave, stored, selected, ctx, reports),
        stored,
        deps.venues,
      );
  const saved = deps.dryRun ? 0 : toSave.length > 0 ? await deps.save(toSave, now) : 0;
  return {
    startedAt: now.toISOString(),
    sources: reports,
    found: reports.reduce((n, r) => n + r.found, 0),
    approved: all.length,
    duplicates: rec.duplicates,
    saved,
    aiPages: reports.reduce((n, r) => n + r.aiPages, 0),
    dryRun: deps.dryRun === true,
    ...(deps.dryRun
      ? {
          preview: rec.toSave.map((e) => ({
            title: e.title,
            startsAt: e.startsAt,
            venue: e.venue,
            sourceUrl: e.sourceUrl,
            sourceId: e.sourceId,
            evidence: e.evidence,
          })),
        }
      : {}),
  };
}
