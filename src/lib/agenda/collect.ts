import { checkRobots, crawlGet, type CrawlDeps } from "@/lib/pipeline/http";
import { approveEvent } from "./approve";
import { dedupeEvents } from "./dedupe";
import { extractIcal } from "./extract/ical";
import { extractJsonLd } from "./extract/jsonld";
import { extractRss } from "./extract/rss";
import { extractSympla } from "./extract/sympla";
import { extractTribe } from "./extract/tribe";
import { dedupeKeyOf, normalizeEvent } from "./normalize";
import type { AgendaSource, NormalizedEvent, RawEvent, RejectReason } from "./types";

export interface ExistingEvent {
  title: string;
  startsAt: string;
  venue: string;
}

export interface CollectDeps {
  crawl: CrawlDeps;
  sources: readonly AgendaSource[];
  now: () => Date;
  /** Eventos já no ar sem origem de coleta (manuais e de leitores): a coleta não os repete. */
  existing: () => Promise<ExistingEvent[]>;
  /** Grava (insere ou atualiza pela chave de duplicidade) os aprovados; devolve quantos. */
  save: (events: NormalizedEvent[], at: Date) => Promise<number>;
  /** Não grava; só relata (ensaio). */
  dryRun?: boolean;
}

export type SourceStatus = "ok" | "robots" | "indisponivel" | "erro";

export interface SourceReport {
  id: string;
  name: string;
  status: SourceStatus;
  detail?: string;
  found: number;
  approved: number;
  rejected: Partial<Record<RejectReason, number>>;
}

export interface CollectReport {
  startedAt: string;
  sources: SourceReport[];
  found: number;
  approved: number;
  duplicates: number;
  saved: number;
  dryRun: boolean;
  /** Eventos aprovados (só no ensaio, para conferência). */
  preview?: { title: string; startsAt: string; venue: string; sourceUrl: string }[];
}

const ACCEPT: Record<AgendaSource["kind"], string> = {
  jsonld: "text/html, application/xhtml+xml;q=0.9, */*;q=0.1",
  sympla: "text/html, application/xhtml+xml;q=0.9, */*;q=0.1",
  tribe: "application/json",
  ical: "text/calendar, text/plain;q=0.8, */*;q=0.1",
  rss: "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.9, */*;q=0.1",
};

function extract(source: AgendaSource, body: string, now: Date): RawEvent[] {
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
      return extractTribe(body).events;
  }
}

async function collectSource(
  source: AgendaSource,
  deps: CollectDeps,
  now: Date,
): Promise<{ report: SourceReport; events: NormalizedEvent[] }> {
  const report: SourceReport = {
    id: source.id,
    name: source.name,
    status: "ok",
    found: 0,
    approved: 0,
    rejected: {},
  };
  const bucket = `agenda:${source.id}`;
  const robots = await checkRobots(deps.crawl, source.url, { bucket, limitPerHour: 60 });
  if (robots.kind === "disallowed")
    return { report: { ...report, status: "robots", detail: robots.reason }, events: [] };
  if (robots.kind !== "allowed") {
    return {
      report: {
        ...report,
        status: "indisponivel",
        detail: robots.kind === "unavailable" ? robots.reason : "limite por hora",
      },
      events: [],
    };
  }
  const res = await crawlGet(deps.crawl, source.url, {
    bucket,
    limitPerHour: 60,
    accept: ACCEPT[source.kind],
  });
  if (res.kind !== "ok") {
    const detail =
      res.kind === "http_error"
        ? `HTTP ${res.status}`
        : res.kind === "network_error"
          ? res.message
          : res.kind;
    return { report: { ...report, status: "erro", detail }, events: [] };
  }
  const events: NormalizedEvent[] = [];
  const raws = extract(source, res.body, now);
  report.found = raws.length;
  const bump = (r: RejectReason) => (report.rejected[r] = (report.rejected[r] ?? 0) + 1);
  for (const raw of raws) {
    const n = normalizeEvent(raw, source);
    if (!n.ok) {
      n.reasons.forEach(bump);
      continue;
    }
    const v = approveEvent(n.event, now);
    if (!v.ok) {
      v.reasons.forEach(bump);
      continue;
    }
    events.push(n.event);
  }
  report.approved = events.length;
  return { report, events };
}

/**
 * Coleta da Agenda: para cada fonte ativa (robots.txt respeitado, limite por hora, uma fonte
 * que falha não derruba as outras) extrai, normaliza, aprova pelas checagens, remove repetidos
 * (entre fontes e contra eventos já no ar) e grava.
 */
export async function collectAgenda(deps: CollectDeps): Promise<CollectReport> {
  const now = deps.now();
  const reports: SourceReport[] = [];
  const all: NormalizedEvent[] = [];
  for (const source of deps.sources.filter((s) => s.enabled)) {
    try {
      const { report, events } = await collectSource(source, deps, now);
      reports.push(report);
      all.push(...events);
    } catch (e) {
      reports.push({
        id: source.id,
        name: source.name,
        status: "erro",
        detail: e instanceof Error ? e.message : String(e),
        found: 0,
        approved: 0,
        rejected: {},
      });
    }
  }
  const existing = (await deps.existing()).map((e): NormalizedEvent => ({
    title: e.title,
    startsAt: e.startsAt,
    venue: e.venue,
    dedupeKey: dedupeKeyOf(e.title, e.startsAt, e.venue),
    endsAt: null,
    neighborhood: null,
    priceCents: null,
    priceUnknown: false,
    category: "",
    sourceUrl: "",
    sourceId: "",
    origin: "organizer",
    description: "",
    venueKnown: true,
    sourceRef: null,
    confirms: false,
    confirmedBySourceId: null,
    evidence: {},
  }));
  const merged = dedupeEvents([...existing, ...all]);
  const fresh = merged.filter((e) => e.sourceId !== "");
  const saved = deps.dryRun ? 0 : fresh.length > 0 ? await deps.save(fresh, now) : 0;
  return {
    startedAt: now.toISOString(),
    sources: reports,
    found: reports.reduce((n, r) => n + r.found, 0),
    approved: all.length,
    duplicates: all.length - fresh.length,
    saved,
    dryRun: deps.dryRun === true,
    ...(deps.dryRun
      ? {
          preview: fresh.map((e) => ({
            title: e.title,
            startsAt: e.startsAt,
            venue: e.venue,
            sourceUrl: e.sourceUrl,
          })),
        }
      : {}),
  };
}
