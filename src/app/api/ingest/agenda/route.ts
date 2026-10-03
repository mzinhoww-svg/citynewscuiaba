import { collectAgenda } from "@/lib/agenda/collect";
import { AGENDA_SOURCES, FIXTURE_AGENDA_SOURCES } from "@/lib/agenda/sources";
import { createServiceClient } from "@/lib/db/client";
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
 * Coleta de eventos da Agenda (AGE-T1). `POST` com `Authorization: Bearer ${CRON_SECRET}`.
 * `?dry=1` só relata (não grava); `?force=1` ignora o intervalo mínimo (execução manual).
 */
export async function POST(req: Request): Promise<Response> {
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
  const runId = dry ? null : await store.startRun(force ? "manual" : "cron", now);
  const report = await collectAgenda({
    crawl: crawlDeps({ repo: createIngestRepo(db) }),
    sources: fixturesEnabled() ? FIXTURE_AGENDA_SOURCES : AGENDA_SOURCES,
    now: () => now,
    existing: () => store.existing(now),
    save: (events, at) => store.save(events, at),
    dryRun: dry,
  });
  if (runId) await store.finishRun(runId, report);
  return Response.json({ status: "done", ...report });
}
