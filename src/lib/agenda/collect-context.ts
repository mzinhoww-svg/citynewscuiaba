/**
 * Tipos e peças comuns da coleta da Agenda (orquestração em `collect.ts`, caminho `ai_page` em
 * `collect-ai.ts`, reconciliação com o banco em `reconcile.ts`): contrato das dependências,
 * relatório por fonte, prazo da execução e pedidos HTTP com prazo.
 */
import type { CallAgent } from "@/lib/ai/call-agent";
import { isAllowedByRobots } from "@/lib/pipeline/crawl";
import { checkRobots, crawlGet, type CrawlDeps, type RobotsVerdict } from "@/lib/pipeline/http";
import type { FetchOutcome } from "@/lib/sources/status";
import { approveEvent } from "./approve";
import type { EvidenceRecord } from "./extract/evidence";
import type { StoredEvent } from "./merge";
import { normalizeEvent } from "./normalize";
import type { AgendaSource, NormalizedEvent, RawEvent, RejectReason } from "./types";

/**
 * Corte da execução: a rota tem 60 s (`maxDuration`); depois de 45 s, contados do início do
 * pedido, nenhum pedido HTTP nem chamada ao modelo novos começam.
 */
export const AI_DEADLINE_MS = 45_000;
/**
 * Prazo duro (55 s): o que estiver em curso é abortado (`signal`), e sobram ~5 s para
 * `stored`/`existing`/`save`/`finishRun`.
 */
export const AI_HARD_DEADLINE_MS = 55_000;
export const LIMIT_PER_HOUR = 60;
const MAX_SAMPLES = 10;

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
  /**
   * Só a prévia do painel (AGM-T6): no ensaio, grava o cache de extração (por URL e hash do
   * texto, nunca evento, execução nem estado da fonte), para o teste seguido da ativação não
   * pagar o modelo duas vezes pelas mesmas páginas. O ensaio da rota (`?dry=1`) não usa.
   */
  cacheWritesInDryRun?: boolean;
  callAgent: CallAgent;
  cache: ExtractCache;
  /** Chamadas ao modelo (listagens e páginas) que ainda cabem nesta execução e hoje. */
  aiBudget: { perRun: number; remainingToday: number };
  /** Relógio monotônico em ms (corte de `AI_DEADLINE_MS`). */
  monotonic: () => number;
  /** `monotonic()` no início do pedido (a rota mede antes de ler fontes e banco). */
  startedAt?: number;
  /** Prazo duro: aborta pedidos HTTP e chamadas ao modelo em curso (a rota passa 55 s). */
  signal?: AbortSignal;
  /** Eventos coletados já guardados com estas chaves ou nos mesmos dias locais delas. */
  stored: (dedupeKeys: string[]) => Promise<StoredCollected[]>;
  /** Resultado da busca na fonte (pausa automática após 3 falhas, como o pipeline de notícias). */
  sourceState: (sourceUuid: string, outcome: FetchOutcome, detail?: string) => Promise<void>;
  /** Só esta fonte (slug ou uuid), mesmo pausada: prévia do teste de conexão. */
  onlySourceId?: string;
  /**
   * Prévia limitada (teste de conexão do painel, AGM-T6): no caminho `ai_page`, lê no máximo
   * estas páginas de evento — e nunca mais do que o teto que sobrou depois das listagens —, em
   * vez de adiar a fonte quando a listagem traz mais links do que cabem.
   */
  maxEventPages?: number;
}

/**
 * `ia_adiada`: fonte `ai_page` deixada para a próxima execução (teto, prazo ou modelo fora);
 * `adiada`: fonte estruturada não alcançada antes do corte. Nenhuma das duas grava nem conta falha.
 */
export type SourceStatus = "ok" | "robots" | "indisponivel" | "erro" | "ia_adiada" | "adiada";

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
  /** Chamadas ao modelo, listagens e páginas (cache não conta). */
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

export const ACCEPT: Record<AgendaSource["kind"], string> = {
  jsonld: "text/html, application/xhtml+xml;q=0.9, */*;q=0.1",
  sympla: "text/html, application/xhtml+xml;q=0.9, */*;q=0.1",
  ai_page: "text/html, application/xhtml+xml;q=0.9, */*;q=0.1",
  tribe: "application/json",
  ical: "text/calendar, text/plain;q=0.8, */*;q=0.1",
  rss: "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.9, */*;q=0.1",
};

export interface RunCtx {
  deps: CollectDeps;
  /** `deps.callAgent` com o prazo duro (`deps.signal`). */
  callAgent: CallAgent;
  now: Date;
  started: number;
  /** Chamadas ao modelo que ainda cabem nesta execução. */
  budget: number;
}

export function createRunCtx(deps: CollectDeps): RunCtx {
  const signal = deps.signal;
  return {
    deps,
    callAgent: signal
      ? (agentId, input, schema, opts) =>
          deps.callAgent(agentId, input, schema, { ...opts, signal: opts?.signal ?? signal })
      : deps.callAgent,
    now: deps.now(),
    started: deps.startedAt ?? deps.monotonic(),
    budget: Math.max(0, Math.min(deps.aiBudget.perRun, deps.aiBudget.remainingToday)),
  };
}

/** Passou do corte (ou o prazo duro já abortou): nada novo começa. */
export const pastCut = (ctx: RunCtx): boolean =>
  ctx.deps.signal?.aborted === true || ctx.deps.monotonic() - ctx.started > AI_DEADLINE_MS;

export function emptyReport(source: AgendaSource): SourceReport {
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

export function reject(report: SourceReport, reasons: readonly RejectReason[], url: string): void {
  for (const r of reasons) {
    report.rejected[r] = (report.rejected[r] ?? 0) + 1;
    if (report.rejectedSamples.length < MAX_SAMPLES)
      report.rejectedSamples.push({ url, reason: r });
  }
}

/** Normaliza e aprova; aprovado entra em `events` com a evidência (se houver). */
export function accept(
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

type CrawlResult = Awaited<ReturnType<typeof crawlGet>>;
/** Resultado de um pedido com prazo: `deadline` = não começou ou foi abortado pelo nosso prazo. */
export type TimedResult = CrawlResult | { kind: "deadline" };

export const fetchDetail = (res: CrawlResult): string =>
  res.kind === "http_error"
    ? `HTTP ${res.status}`
    : res.kind === "network_error"
      ? res.message
      : res.kind;

/** `crawlGet` que respeita o corte e o prazo duro (falha por causa do nosso prazo não é da fonte). */
export async function timedGet(
  ctx: RunCtx,
  source: AgendaSource,
  url: string,
  accept: string,
): Promise<TimedResult> {
  if (pastCut(ctx)) return { kind: "deadline" };
  const res = await crawlGet(ctx.deps.crawl, url, {
    bucket: `agenda:${source.id}`,
    limitPerHour: LIMIT_PER_HOUR,
    accept,
    ...(ctx.deps.signal ? { signal: ctx.deps.signal } : {}),
  });
  if (res.kind !== "ok" && ctx.deps.signal?.aborted) return { kind: "deadline" };
  return res;
}

export type RobotsGate = (url: string) => Promise<RobotsVerdict | { kind: "deadline" }>;

/** robots.txt lido uma vez por host (com prazo); os demais caminhos são conferidos localmente. */
export function robotsGate(ctx: RunCtx, source: AgendaSource): RobotsGate {
  const byHost = new Map<string, RobotsVerdict>();
  return async (url) => {
    const u = new URL(url);
    const known = byHost.get(u.host);
    if (!known) {
      if (pastCut(ctx)) return { kind: "deadline" };
      const verdict = await checkRobots(ctx.deps.crawl, url, {
        bucket: `agenda:${source.id}`,
        limitPerHour: LIMIT_PER_HOUR,
        ...(ctx.deps.signal ? { signal: ctx.deps.signal } : {}),
      });
      if (verdict.kind === "unavailable" && ctx.deps.signal?.aborted) return { kind: "deadline" };
      byHost.set(u.host, verdict);
      return verdict;
    }
    if (known.kind === "allowed" && known.robotsTxt !== null) {
      const path = `${u.pathname}${u.search}`;
      if (!isAllowedByRobots(known.robotsTxt, ctx.deps.crawl.userAgent, path))
        return {
          kind: "disallowed",
          reason: `robots.txt bloqueia ${path}`,
          robotsTxt: known.robotsTxt,
        };
    }
    return known;
  };
}
