import { createHash } from "node:crypto";
import { z } from "zod";
import type { CallAgent } from "@/lib/ai/call-agent";
import type { AiError } from "@/lib/ai/types";
import { isAllowedByRobots } from "@/lib/pipeline/crawl";
import { checkRobots, crawlGet, type CrawlDeps } from "@/lib/pipeline/http";
import { sanitizeExternalText } from "@/lib/security/sanitize";
import type { FetchOutcome } from "@/lib/sources/status";
import { approveEvent } from "./approve";
import { applyConfirmation, confirmEvents, findConfirmer } from "./confirm";
import { dedupeEvents } from "./dedupe";
import { extractEventPage, extractListingLinks } from "./extract/ai-page";
import { evidenceRecordSchema, type EvidenceRecord } from "./extract/evidence";
import { extractIcal } from "./extract/ical";
import { extractJsonLd } from "./extract/jsonld";
import { extractRss } from "./extract/rss";
import { extractSympla } from "./extract/sympla";
import { extractTribe } from "./extract/tribe";
import { mergeForSave, type StoredEvent } from "./merge";
import { dedupeKeyOf, describeEvent, normalizeEvent } from "./normalize";
import {
  REJECT_REASONS,
  type AgendaSource,
  type NormalizedEvent,
  type RawEvent,
  type RejectReason,
} from "./types";

/** A rota tem 60 s (`maxDuration`): depois de 45 s nenhuma página `ai_page` nova começa. */
export const AI_DEADLINE_MS = 45_000;
/** Prazo duro das chamadas ao modelo (a rota passa `AbortSignal.timeout` com este valor). */
export const AI_HARD_DEADLINE_MS = 55_000;
/** API Tribe: até 3 páginas de 50 eventos por execução. */
const TRIBE_MAX_PAGES = 3;
const TRIBE_PER_PAGE = "50";
const MAX_SAMPLES = 10;
const LIMIT_PER_HOUR = 60;

export interface ExistingEvent {
  title: string;
  startsAt: string;
  venue: string;
}

/**
 * Evento coletado já guardado (`dedupe_key` não nulo), com o que a confirmação precisa.
 * `confirms` = a fonte de origem (`source_ref`) é uma fonte que confirma.
 */
export type StoredCollected = StoredEvent &
  Pick<
    NormalizedEvent,
    | "dedupeKey"
    | "sourceId"
    | "sourceRef"
    | "origin"
    | "confirms"
    | "confirmedBySourceId"
    | "evidence"
  >;

/** Cache de extração por (URL, hash do texto): página igual não passa de novo pelo modelo. */
export interface ExtractCache {
  get(url: string, hash: string): Promise<unknown | null>;
  put(url: string, hash: string, result: unknown): Promise<void>;
}

export interface CollectDeps {
  crawl: CrawlDeps;
  sources: readonly AgendaSource[];
  now: () => Date;
  /** Eventos já no ar sem origem de coleta (manuais e de leitores): a coleta não os repete. */
  existing: () => Promise<ExistingEvent[]>;
  /** Grava (insere ou atualiza pela chave de duplicidade) os aprovados; devolve quantos. */
  save: (events: NormalizedEvent[], at: Date) => Promise<number>;
  /** Não grava eventos, cache, execução nem estado da fonte; só relata (ensaio). */
  dryRun?: boolean;
  callAgent: CallAgent;
  cache: ExtractCache;
  /** Páginas de evento que ainda podem ir ao modelo nesta execução e hoje. */
  aiBudget: { perRun: number; remainingToday: number };
  /** Relógio monotônico em ms (prazo de `AI_DEADLINE_MS`). */
  monotonic: () => number;
  /**
   * Prazo duro das chamadas ao modelo (a rota passa ~55 s): a página em curso no fim do prazo
   * vira `ia_adiada` em vez de estourar os 60 s. Não vale para os pedidos HTTP (que têm 10 s e
   * não devem contar falha da fonte por causa do nosso prazo).
   */
  signal?: AbortSignal;
  /** Eventos coletados já guardados com estas chaves ou nos mesmos dias locais delas. */
  stored: (dedupeKeys: string[]) => Promise<StoredCollected[]>;
  /** Resultado da busca na fonte (pausa automática após 3 falhas, como o pipeline de notícias). */
  sourceState: (sourceUuid: string, outcome: FetchOutcome, detail?: string) => Promise<void>;
  /** Só esta fonte (slug ou uuid), mesmo pausada: prévia do teste de conexão. */
  onlySourceId?: string;
}

export type SourceStatus = "ok" | "robots" | "indisponivel" | "erro" | "ia_adiada";

export interface RejectedSample {
  url: string;
  reason: RejectReason;
}

export interface SourceReport {
  id: string;
  uuid: string;
  name: string;
  status: SourceStatus;
  detail?: string;
  found: number;
  approved: number;
  rejected: Partial<Record<RejectReason, number>>;
  /** Páginas enviadas ao modelo (cache não conta). */
  aiPages: number;
  /** Eventos de descoberta (desta execução ou guardados) que esta fonte confirmou. */
  confirmed: number;
  new: number;
  updated: number;
  rejectedSamples: RejectedSample[];
}

export interface PreviewItem {
  title: string;
  startsAt: string;
  venue: string;
  sourceUrl: string;
  sourceId: string;
  evidence: EvidenceRecord;
}

export interface CollectReport {
  startedAt: string;
  sources: SourceReport[];
  found: number;
  approved: number;
  duplicates: number;
  saved: number;
  aiPages: number;
  dryRun: boolean;
  /** Eventos que seriam gravados (só no ensaio, para conferência). */
  preview?: PreviewItem[];
}

const ACCEPT: Record<AgendaSource["kind"], string> = {
  jsonld: "text/html, application/xhtml+xml;q=0.9, */*;q=0.1",
  sympla: "text/html, application/xhtml+xml;q=0.9, */*;q=0.1",
  ai_page: "text/html, application/xhtml+xml;q=0.9, */*;q=0.1",
  tribe: "application/json",
  ical: "text/calendar, text/plain;q=0.8, */*;q=0.1",
  rss: "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.9, */*;q=0.1",
};

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

const REJECT_SET: ReadonlySet<string> = new Set(REJECT_REASONS);
const isRejectReason = (v: AiError | RejectReason): v is RejectReason => REJECT_SET.has(v);

// ---------------------------------------------------------------------------------------------
// Cache: o que volta do banco é `unknown` e é conferido antes de usar.
// ---------------------------------------------------------------------------------------------

const rawEventSchema = z.object({
  title: z.string(),
  start: z.string(),
  end: z.string().nullish(),
  venue: z.string().nullish(),
  address: z.string().nullish(),
  city: z.string().nullish(),
  neighborhood: z.string().nullish(),
  url: z.string().nullish(),
  priceCents: z.number().nullish(),
  online: z.boolean().optional(),
  category: z.string().nullish(),
});
const cachedPageSchema = z.union([
  z.object({
    ok: z.literal(true),
    value: z.object({ raw: rawEventSchema, evidence: evidenceRecordSchema }),
  }),
  z.object({ ok: z.literal(false), error: z.enum(REJECT_REASONS) }),
]);
type CachedPage = z.infer<typeof cachedPageSchema>;
const cachedListingSchema = z.object({ links: z.array(z.string()).max(30) });

// ---------------------------------------------------------------------------------------------
// Por fonte
// ---------------------------------------------------------------------------------------------

interface RunCtx {
  deps: CollectDeps;
  /** `deps.callAgent` com o prazo duro (`deps.signal`). */
  callAgent: CallAgent;
  now: Date;
  started: number;
  /** Páginas que ainda podem ir ao modelo nesta execução. */
  budget: number;
}

interface SourceResult {
  report: SourceReport;
  events: NormalizedEvent[];
  /** Resultado da busca para `sourceState` (ausente: não mexe no estado). */
  outcome?: { outcome: FetchOutcome; detail?: string };
}

function emptyReport(source: AgendaSource): SourceReport {
  return {
    id: source.id,
    uuid: source.uuid,
    name: source.name,
    status: "ok",
    found: 0,
    approved: 0,
    rejected: {},
    aiPages: 0,
    confirmed: 0,
    new: 0,
    updated: 0,
    rejectedSamples: [],
  };
}

function reject(report: SourceReport, reasons: readonly RejectReason[], url: string): void {
  for (const r of reasons) {
    report.rejected[r] = (report.rejected[r] ?? 0) + 1;
    if (report.rejectedSamples.length < MAX_SAMPLES)
      report.rejectedSamples.push({ url, reason: r });
  }
}

/** Normaliza e aprova; aprovado entra em `events` com a evidência (se houver). */
function accept(
  raw: RawEvent,
  source: AgendaSource,
  ctx: RunCtx,
  report: SourceReport,
  events: NormalizedEvent[],
  evidence: EvidenceRecord = {},
): void {
  const where = raw.url || source.url;
  const n = normalizeEvent(raw, source);
  if (!n.ok) return reject(report, n.reasons, where);
  const v = approveEvent(n.event, ctx.now);
  if (!v.ok) return reject(report, v.reasons, where);
  events.push({ ...n.event, evidence });
}

const fetchDetail = (res: Awaited<ReturnType<typeof crawlGet>>): string =>
  res.kind === "http_error"
    ? `HTTP ${res.status}`
    : res.kind === "network_error"
      ? res.message
      : res.kind;

/** robots.txt lido uma vez por host; os demais caminhos são conferidos localmente. */
function robotsGate(ctx: RunCtx, bucket: string) {
  const byHost = new Map<string, Awaited<ReturnType<typeof checkRobots>>>();
  return async (url: string) => {
    const u = new URL(url);
    let verdict = byHost.get(u.host);
    if (!verdict) {
      verdict = await checkRobots(ctx.deps.crawl, url, { bucket, limitPerHour: LIMIT_PER_HOUR });
      byHost.set(u.host, verdict);
      return verdict;
    }
    if (verdict.kind === "allowed" && verdict.robotsTxt !== null) {
      const path = `${u.pathname}${u.search}`;
      if (!isAllowedByRobots(verdict.robotsTxt, ctx.deps.crawl.userAgent, path))
        return {
          kind: "disallowed" as const,
          reason: `robots.txt bloqueia ${path}`,
          robotsTxt: verdict.robotsTxt,
        };
    }
    return verdict;
  };
}

const deadlinePassed = (ctx: RunCtx) => ctx.deps.monotonic() - ctx.started > AI_DEADLINE_MS;

async function collectStructured(
  source: AgendaSource,
  ctx: RunCtx,
  report: SourceReport,
  body: string,
  events: NormalizedEvent[],
): Promise<void> {
  const raws: RawEvent[] =
    source.kind === "jsonld"
      ? extractJsonLd(body)
      : source.kind === "ical"
        ? extractIcal(body)
        : source.kind === "rss"
          ? extractRss(body, ctx.now)
          : source.kind === "sympla"
            ? extractSympla(body)
            : [];
  report.found += raws.length;
  for (const raw of raws) accept(raw, source, ctx, report, events);
}

async function collectTribe(
  source: AgendaSource,
  ctx: RunCtx,
  report: SourceReport,
  firstBody: string,
  robots: ReturnType<typeof robotsGate>,
  events: NormalizedEvent[],
): Promise<void> {
  let body = firstBody;
  const seen = new Set<string>();
  for (let page = 1; ; page++) {
    const { events: raws, next } = extractTribe(body);
    report.found += raws.length;
    for (const raw of raws) accept(raw, source, ctx, report, events);
    if (!next || page >= TRIBE_MAX_PAGES || seen.has(next)) return;
    seen.add(next);
    let nextUrl: URL;
    try {
      nextUrl = new URL(next);
    } catch {
      return;
    }
    // Só segue páginas do mesmo site; fim da paginação por erro não invalida o que já veio.
    if (nextUrl.host !== new URL(source.url).host) return;
    if ((await robots(nextUrl.href)).kind !== "allowed") return;
    const res = await crawlGet(ctx.deps.crawl, nextUrl.href, {
      bucket: `agenda:${source.id}`,
      limitPerHour: LIMIT_PER_HOUR,
      accept: ACCEPT.tribe,
    });
    if (res.kind !== "ok") return;
    body = res.body;
  }
}

type AiStep = { ok: true } | { ok: false; detail: string };

async function listingLinks(
  source: AgendaSource,
  ctx: RunCtx,
  listUrl: string,
  body: string,
): Promise<{ ok: true; links: string[] } | { ok: false; detail: string }> {
  const hash = sha256(body);
  const hit = cachedListingSchema.safeParse(await ctx.deps.cache.get(listUrl, hash));
  if (hit.success) return { ok: true, links: hit.data.links };
  if (deadlinePassed(ctx)) return { ok: false, detail: "prazo da execução" };
  if (ctx.budget <= 0) return { ok: false, detail: "teto de páginas" };
  const res = await extractListingLinks(ctx.callAgent, {
    html: body,
    baseUrl: listUrl,
    notes: source.notes,
  });
  if (!res.ok) return { ok: false, detail: `modelo: ${res.error}` };
  if (!ctx.deps.dryRun) await ctx.deps.cache.put(listUrl, hash, { links: res.value });
  return { ok: true, links: res.value };
}

/** Uma página de evento: cache ou modelo. `null` = a fonte fica para a próxima execução. */
async function eventPage(
  source: AgendaSource,
  ctx: RunCtx,
  report: SourceReport,
  url: string,
  body: string,
): Promise<{ ok: true; page: CachedPage } | { ok: false; detail: string }> {
  const hash = sha256(sanitizeExternalText(body).text);
  const hit = cachedPageSchema.safeParse(await ctx.deps.cache.get(url, hash));
  if (hit.success) return { ok: true, page: hit.data };
  if (ctx.budget <= 0) return { ok: false, detail: "teto de páginas" };
  ctx.budget--;
  report.aiPages++;
  const res = await extractEventPage(ctx.callAgent, { html: body, url, notes: source.notes });
  let page: CachedPage;
  if (res.ok) page = { ok: true, value: res.value };
  else if (isRejectReason(res.error)) page = { ok: false, error: res.error };
  // Saída fora do esquema: recusada agora, sem cache (nova tentativa só no próximo ciclo).
  else if (res.error === "schema")
    return { ok: true, page: { ok: false, error: "extracao_invalida" } };
  else if (res.error === "injection") page = { ok: false, error: "texto_suspeito" };
  else return { ok: false, detail: `modelo: ${res.error}` };
  if (!ctx.deps.dryRun) await ctx.deps.cache.put(url, hash, page);
  return { ok: true, page };
}

async function collectAiPage(
  source: AgendaSource,
  ctx: RunCtx,
  report: SourceReport,
  robots: ReturnType<typeof robotsGate>,
  events: NormalizedEvent[],
): Promise<AiStep & { fetched: boolean; fetchError?: string }> {
  const bucket = `agenda:${source.id}`;
  const listUrls = [...new Set([source.url, ...source.listUrls])];
  const links: string[] = [];
  let fetched = false;
  let fetchError: string | undefined;
  for (const listUrl of listUrls) {
    if ((await robots(listUrl)).kind !== "allowed") continue;
    const res = await crawlGet(ctx.deps.crawl, listUrl, {
      bucket,
      limitPerHour: LIMIT_PER_HOUR,
      accept: ACCEPT.ai_page,
    });
    if (res.kind !== "ok") {
      fetchError ??= fetchDetail(res);
      continue;
    }
    fetched = true;
    const found = await listingLinks(source, ctx, listUrl, res.body);
    if (!found.ok) return { ok: false, detail: found.detail, fetched, fetchError };
    for (const l of found.links) if (!links.includes(l)) links.push(l);
  }
  if (!fetched) return { ok: true, fetched, fetchError };

  let unavailable = 0;
  for (const url of links) {
    if (deadlinePassed(ctx)) return { ok: false, detail: "prazo da execução", fetched };
    if ((await robots(url)).kind !== "allowed") continue;
    const res = await crawlGet(ctx.deps.crawl, url, {
      bucket,
      limitPerHour: LIMIT_PER_HOUR,
      accept: ACCEPT.ai_page,
    });
    if (res.kind !== "ok") {
      unavailable++;
      continue;
    }
    const step = await eventPage(source, ctx, report, url, res.body);
    if (!step.ok) return { ok: false, detail: step.detail, fetched };
    report.found++;
    if (!step.page.ok) reject(report, [step.page.error], url);
    else accept(step.page.value.raw, source, ctx, report, events, step.page.value.evidence);
  }
  if (unavailable > 0) report.detail = `${unavailable} página(s) de evento indisponível(is)`;
  return { ok: true, fetched };
}

async function collectSource(source: AgendaSource, ctx: RunCtx): Promise<SourceResult> {
  const report = emptyReport(source);
  const events: NormalizedEvent[] = [];
  const deferred = (detail: string, outcome?: SourceResult["outcome"]): SourceResult => ({
    report: { ...report, status: "ia_adiada", detail, approved: 0 },
    events: [],
    outcome,
  });
  if (source.kind === "ai_page") {
    if (deadlinePassed(ctx)) return deferred("prazo da execução");
    if (ctx.budget <= 0) return deferred("teto de páginas");
  }
  const bucket = `agenda:${source.id}`;
  const robots = robotsGate(ctx, bucket);
  const verdict = await robots(source.url);
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

  if (source.kind === "ai_page") {
    const r = await collectAiPage(source, ctx, report, robots, events);
    const ok = { outcome: "ok" as const };
    if (!r.ok) return deferred(r.detail, r.fetched ? ok : undefined);
    if (!r.fetched) {
      const detail = r.fetchError ?? "listagem bloqueada";
      return {
        report: { ...report, status: "erro", detail },
        events: [],
        outcome: { outcome: "failed", detail },
      };
    }
    report.approved = events.length;
    return { report, events, outcome: ok };
  }

  const url =
    source.kind === "tribe"
      ? (() => {
          const u = new URL(source.url);
          if (!u.searchParams.has("per_page")) u.searchParams.set("per_page", TRIBE_PER_PAGE);
          return u.href;
        })()
      : source.url;
  const res = await crawlGet(ctx.deps.crawl, url, {
    bucket,
    limitPerHour: LIMIT_PER_HOUR,
    accept: ACCEPT[source.kind],
  });
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
  if (source.kind === "tribe") await collectTribe(source, ctx, report, res.body, robots, events);
  else await collectStructured(source, ctx, report, res.body, events);
  report.approved = events.length;
  return { report, events, outcome: { outcome: "ok" } };
}

// ---------------------------------------------------------------------------------------------
// Execução
// ---------------------------------------------------------------------------------------------

const placeholder = (e: ExistingEvent): NormalizedEvent => ({
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
});

const fromStored = (s: StoredCollected): NormalizedEvent => ({
  title: s.title,
  startsAt: s.startsAt,
  endsAt: s.endsAt,
  venue: s.venue,
  neighborhood: s.neighborhood,
  priceCents: s.priceCents,
  priceUnknown: s.priceUnknown,
  category: s.category,
  description: s.description,
  sourceUrl: s.sourceUrl,
  sourceId: s.sourceId,
  sourceRef: s.sourceRef,
  origin: s.origin,
  dedupeKey: s.dedupeKey,
  venueKnown: true,
  confirms: s.confirms,
  confirmedBySourceId: s.confirmedBySourceId,
  evidence: s.evidence,
});

/**
 * Coleta da Agenda: para cada fonte ativa (robots.txt respeitado, limite por hora, uma fonte
 * que falha não derruba as outras) extrai — estruturado ou pela leitura da página (`ai_page`,
 * com cache, teto de páginas e prazo) —, normaliza, aprova, confirma entre fontes, remove
 * repetidos (entre fontes, contra eventos já no ar e contra os já guardados) e grava. Fonte
 * adiada (`ia_adiada`) não grava nada nesta execução: as páginas já lidas ficam no cache.
 */
export async function collectAgenda(deps: CollectDeps): Promise<CollectReport> {
  const now = deps.now();
  const signal = deps.signal;
  const ctx: RunCtx = {
    deps,
    callAgent: signal
      ? (agentId, input, schema, opts) =>
          deps.callAgent(agentId, input, schema, { ...opts, signal: opts?.signal ?? signal })
      : deps.callAgent,
    now,
    started: deps.monotonic(),
    budget: Math.max(0, Math.min(deps.aiBudget.perRun, deps.aiBudget.remainingToday)),
  };
  const only = deps.onlySourceId;
  const selected = only
    ? deps.sources.filter((s) => s.id === only || s.uuid === only)
    : deps.sources.filter((s) => s.enabled);

  // Estruturadas primeiro (rápidas, sem modelo), `ai_page` por último: o prazo só alcança estas.
  // Relatório e duplicidade seguem a ordem das fontes.
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
  const reportOf = new Map(reports.map((r) => [r.id, r]));
  const reportByUuid = new Map(reports.map((r) => [r.uuid, r]));

  // Já guardados (mesma chave ou mesmo dia): identidade da linha, travas e retirada.
  const stored = all.length > 0 ? await deps.stored([...new Set(all.map((e) => e.dedupeKey))]) : [];
  const storedByKey = new Map(stored.map((s) => [s.dedupeKey, s]));
  const storedN = stored.map(fromStored);
  const runConfirmers = all.filter((e) => e.confirms);

  // (b) Guardado de descoberta que uma fonte desta execução confirma: atualiza a linha guardada
  // (mesma chave e slug) com data, hora e local de quem confirma; o evento dela não vira 2ª linha.
  const absorbed = new Set<NormalizedEvent>();
  const updates = new Set<NormalizedEvent>();
  const owner = new Map<NormalizedEvent, string>();
  for (const s of storedN) {
    if (s.confirms) continue;
    const probe = { ...s, confirmedBySourceId: null };
    const pair = findConfirmer(probe, runConfirmers);
    if (!pair) continue;
    absorbed.add(pair);
    const c = applyConfirmation(probe, pair);
    const upd = { ...c, description: describeEvent(c) };
    updates.add(upd);
    owner.set(upd, pair.sourceId);
    const rep = reportOf.get(pair.sourceId);
    if (rep) rep.confirmed++;
  }

  // (c) Descoberta igual a evento guardado de fonte que confirma: a linha dela já existe.
  const storedConfirmers = storedN.filter((s) => s.confirms);
  const rest = all.filter(
    (e) => !absorbed.has(e) && (e.confirms || !findConfirmer(e, storedConfirmers)),
  );

  // (a) Descoberta confirmada nesta execução: o dedupe fica com o evento de quem confirma.
  const confirmed = confirmEvents(rest, runConfirmers);
  for (const e of confirmed) {
    if (e.confirms || !e.confirmedBySourceId) continue;
    const rep = reportByUuid.get(e.confirmedBySourceId);
    if (rep) rep.confirmed++;
  }

  const existing = (await deps.existing()).map(placeholder);
  const merged = dedupeEvents([...existing, ...updates, ...confirmed]);
  const fresh = merged.filter((e) => e.sourceId !== "");
  const toSave: NormalizedEvent[] = [];
  for (const e of fresh) {
    const prev = storedByKey.get(e.dedupeKey) ?? null;
    const out = mergeForSave(e, prev);
    if (!out) continue;
    toSave.push(out);
    const rep = reportOf.get(owner.get(e) ?? e.sourceId);
    if (rep) {
      if (prev) rep.updated++;
      else rep.new++;
    }
  }
  const freshRun = fresh.filter((e) => !updates.has(e)).length;
  const saved = deps.dryRun ? 0 : toSave.length > 0 ? await deps.save(toSave, now) : 0;
  return {
    startedAt: now.toISOString(),
    sources: reports,
    found: reports.reduce((n, r) => n + r.found, 0),
    approved: all.length,
    duplicates: all.length - absorbed.size - freshRun,
    saved,
    aiPages: reports.reduce((n, r) => n + r.aiPages, 0),
    dryRun: deps.dryRun === true,
    ...(deps.dryRun
      ? {
          preview: toSave.map((e) => ({
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
