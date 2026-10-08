import { AI_HARD_DEADLINE_MS, collectAgenda, type ExtractCache } from "@/lib/agenda/collect";
import { FIXTURE_AGENDA_SOURCES } from "@/lib/agenda/sources";
import { createProductionAi } from "@/lib/ai/server";
import { createServiceClient } from "@/lib/db/client";
import { loadEventSources } from "@/lib/db/agenda-sources";
import { createAgendaStore } from "@/lib/db/agenda-store";
import { createIngestRepo } from "@/lib/db/pipeline-store";
import { isCronAuthorized, unauthorized } from "@/lib/security/cron-auth";
import { crawlDeps, fixturesEnabled } from "@/lib/sources/http-deps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Intervalo mínimo entre coletas automáticas (o pg_cron chama a cada 6 h; o watchdog cobre). */
const MIN_INTERVAL_MS = 5 * 3_600_000;

/**
 * Coleta de eventos da Agenda (AGE-T1, AGM-T5). `POST` com `Authorization: Bearer ${CRON_SECRET}`.
 * Fontes de `sources` (`kind = 'events'`); no modo de fixtures, as fictícias. `?dry=1` só relata
 * (não grava eventos, cache, execução nem estado da fonte); `?force=1` ignora o intervalo mínimo.
 */
export async function POST(req: Request): Promise<Response> {
  // Um prazo só, medido do início do pedido: leitura das fontes, expurgo e abertura da execução
  // contam nos 45 s do corte e nos 55 s do prazo duro (sobram ~5 s para gravar).
  const startedAt = performance.now();
  const hardDeadline = AbortSignal.timeout(AI_HARD_DEADLINE_MS);
  if (!isCronAuthorized(req.headers.get("authorization"), process.env.CRON_SECRET))
    return unauthorized();
  const url = new URL(req.url);
  const dry = url.searchParams.get("dry") === "1";
  const force = url.searchParams.get("force") === "1";

  const db = createServiceClient();
  const store = createAgendaStore(db);
  const now = new Date();
  if (!dry && !force) {
    const last = await store.lastRunStartedAt();
    if (last && now.getTime() - last.getTime() < MIN_INTERVAL_MS) {
      return Response.json({
        status: "skipped",
        reason: "recent",
        lastStartedAt: last.toISOString(),
      });
    }
  }
  const sources = fixturesEnabled() ? FIXTURE_AGENDA_SOURCES : await loadEventSources(db);
  if (!dry) await store.cachePurge(now);
  const [limits, usedToday] = await Promise.all([store.aiLimits(), store.aiPagesToday(now)]);
  const cache: ExtractCache = dry
    ? { get: store.cacheGet, put: async () => {} }
    : { get: store.cacheGet, put: store.cachePut };
  const runId = dry ? null : await store.startRun(force ? "manual" : "cron", now);
  const report = await collectAgenda({
    crawl: crawlDeps({ repo: createIngestRepo(db) }),
    sources,
    now: () => now,
    existing: () => store.existing(now),
    save: (events, at) => store.save(events, at),
    dryRun: dry,
    callAgent: createProductionAi().callAgent,
    cache,
    aiBudget: { perRun: limits.perRun, remainingToday: Math.max(0, limits.perDay - usedToday) },
    monotonic: () => performance.now(),
    startedAt,
    signal: hardDeadline,
    stored: (keys) => store.stored(keys),
    sourceState: (uuid, outcome, detail) => store.sourceState(uuid, outcome, detail),
  });
  if (runId) await store.finishRun(runId, report);
  return Response.json({ status: "done", ...report });
}
