import "server-only";
import {
  AI_HARD_DEADLINE_MS,
  collectAgenda,
  type CollectDeps,
  type SourceReport,
} from "@/lib/agenda/collect";
import {
  PREVIEW_AI_CALLS,
  PREVIEW_MAX_EVENTS,
  previewFromReport,
  type EventSourcePreviewData,
} from "@/lib/agenda/preview";
import type { AgendaSource } from "@/lib/agenda/types";
import { createProductionAi } from "@/lib/ai/server";
import { createServiceClient, type DbClient } from "@/lib/db/client";
import { loadEventSources } from "@/lib/db/agenda-sources";
import { createAgendaStore } from "@/lib/db/agenda-store";
import { createExternalMediaRepo } from "@/lib/db/external-media-store";
import { registerExternalImage } from "@/lib/media/external";
import { productionMediaStore } from "@/lib/pipeline/deps";
import { createFlags, createIngestRepo } from "@/lib/db/pipeline-store";
import type { QueryError } from "@/lib/db/queries/types";
import { err, ok, type Result } from "@/lib/result";
import { crawlDeps } from "@/lib/sources/http-deps";

export type AgendaStore = ReturnType<typeof createAgendaStore>;

export interface AgendaDepsOptions {
  sources: readonly AgendaSource[];
  now: Date;
  dryRun: boolean;
  /** `performance.now()` no início do pedido: o corte de 45 s conta daqui. */
  startedAt: number;
  /** Prazo duro (55 s): aborta pedidos e chamadas ao modelo em curso. */
  signal: AbortSignal;
  aiBudget: CollectDeps["aiBudget"];
  onlySourceId?: string;
  maxEventPages?: number;
  /** Ensaio que grava o cache de extração (só a prévia do painel). */
  cacheWritesInDryRun?: boolean;
}

/**
 * Dependências da coleta da Agenda (uma fiação só para a rota do cron, a prévia e o "Coletar
 * agora" do painel): rede pelo `crawlDeps` (fixtures fora de produção), modelo de produção, banco
 * pela service role. No ensaio o cache é só leitura.
 */
export function agendaCollectDeps(
  db: DbClient,
  store: AgendaStore,
  o: AgendaDepsOptions,
): CollectDeps {
  const crawl = crawlDeps({ repo: createIngestRepo(db) });
  // Flag lida uma vez por execução (falha na leitura = desligada).
  let reproduction: Promise<boolean> | null = null;
  const reproductionEnabled = () =>
    (reproduction ??= createFlags(db).isEnabled("image_reproduction_enabled"));
  const images = {
    crawl,
    repo: createExternalMediaRepo(db),
    store: productionMediaStore(db),
    reproductionEnabled,
    now: () => new Date(),
    signal: o.signal,
  };
  return {
    crawl,
    sources: o.sources,
    now: () => o.now,
    existing: () => store.existing(o.now),
    save: (events, at) => store.save(events, at),
    dryRun: o.dryRun,
    callAgent: createProductionAi().callAgent,
    cache:
      o.dryRun && !o.cacheWritesInDryRun
        ? { get: store.cacheGet, put: async () => {} }
        : { get: store.cacheGet, put: store.cachePut },
    aiBudget: o.aiBudget,
    monotonic: () => performance.now(),
    startedAt: o.startedAt,
    signal: o.signal,
    stored: (keys) => store.stored(keys),
    sourceState: (uuid, outcome, detail) => store.sourceState(uuid, outcome, detail),
    ...(o.onlySourceId ? { onlySourceId: o.onlySourceId } : {}),
    ...(o.maxEventPages !== undefined ? { maxEventPages: o.maxEventPages } : {}),
    ...(o.cacheWritesInDryRun ? { cacheWritesInDryRun: true } : {}),
    // Imagem de divulgação no Media Registry: só na coleta real (o ensaio não grava mídia).
    ...(o.dryRun ? {} : { registerImage: (input) => registerExternalImage(images, input) }),
  };
}

/** Teto da execução e o que sobra do dia (`app_settings` menos as linhas por fonte de hoje). */
export async function remainingAiBudget(
  store: AgendaStore,
  now: Date,
): Promise<CollectDeps["aiBudget"]> {
  const [limits, usedToday] = await Promise.all([store.aiLimits(), store.aiPagesToday(now)]);
  return { perRun: limits.perRun, remainingToday: Math.max(0, limits.perDay - usedToday) };
}

const failure = (e: unknown): QueryError => ({
  kind: "unavailable",
  message: e instanceof Error ? e.message : String(e),
});

async function eventSource(
  db: DbClient,
  sourceId: string,
): Promise<{ sources: AgendaSource[]; source: AgendaSource } | null> {
  const sources = await loadEventSources(db);
  const source = sources.find((s) => s.uuid === sourceId);
  return source ? { sources, source } : null;
}

/**
 * Prévia do teste de conexão de uma fonte de eventos (mesmo pausada): ensaio restrito à fonte,
 * até 6 chamadas ao modelo (1 listagem + 5 páginas) e até 5 eventos com os trechos de evidência.
 * Não grava eventos, execução nem estado da fonte (não conta no teto do dia); grava só o cache de
 * extração, para a ativação logo depois reaproveitar as mesmas páginas sem chamar o modelo.
 * Quem chama (Server Action do painel) já conferiu `source.manage`.
 */
export async function previewEventSource(
  sourceId: string,
): Promise<Result<EventSourcePreviewData, QueryError>> {
  const startedAt = performance.now();
  const signal = AbortSignal.timeout(AI_HARD_DEADLINE_MS);
  try {
    const db = createServiceClient();
    const found = await eventSource(db, sourceId);
    if (!found) return err({ kind: "unavailable", message: "fonte de eventos não encontrada" });
    const store = createAgendaStore(db);
    const report = await collectAgenda(
      agendaCollectDeps(db, store, {
        sources: found.sources,
        now: new Date(),
        dryRun: true,
        startedAt,
        signal,
        aiBudget: { perRun: PREVIEW_AI_CALLS, remainingToday: PREVIEW_AI_CALLS },
        onlySourceId: found.source.uuid,
        maxEventPages: PREVIEW_MAX_EVENTS,
        cacheWritesInDryRun: true,
      }),
    );
    return ok(previewFromReport(report, found.source));
  } catch (e) {
    return err(failure(e));
  }
}

/**
 * "Coletar agora" de uma fonte de eventos ativa: coleta real só desta fonte, com o teto do dia,
 * grava os eventos e uma linha por fonte em `agenda_collect_runs` (sem linha-resumo, para não
 * adiar o ciclo de todas). Devolve o relatório da fonte.
 */
export async function collectEventSource(
  sourceId: string,
): Promise<Result<SourceReport, QueryError>> {
  const startedAt = performance.now();
  const signal = AbortSignal.timeout(AI_HARD_DEADLINE_MS);
  try {
    const db = createServiceClient();
    const found = await eventSource(db, sourceId);
    if (!found) return err({ kind: "unavailable", message: "fonte de eventos não encontrada" });
    const store = createAgendaStore(db);
    const now = new Date();
    const report = await collectAgenda(
      agendaCollectDeps(db, store, {
        sources: found.sources,
        now,
        dryRun: false,
        startedAt,
        signal,
        aiBudget: await remainingAiBudget(store, now),
        onlySourceId: found.source.uuid,
      }),
    );
    await store.finishSourceRun(report);
    const rep = report.sources.find((s) => s.uuid === found.source.uuid);
    if (!rep) return err({ kind: "unavailable", message: "fonte fora do relatório" });
    return ok(rep);
  } catch (e) {
    return err(failure(e));
  }
}
