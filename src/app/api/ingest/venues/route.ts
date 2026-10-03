import { createServiceClient } from "@/lib/db/client";
import { createGuideStore } from "@/lib/db/guide-store";
import { createIngestRepo } from "@/lib/db/pipeline-store";
import { allTargets, pickTargets } from "@/lib/guide/plan";
import { buildProviders } from "@/lib/guide/providers/factory";
import { fetchSiteFacts } from "@/lib/guide/providers/site";
import { runVenueSync } from "@/lib/pipeline/steps/venue-sync";
import { isCronAuthorized, unauthorized } from "@/lib/security/cron-auth";
import { crawlDeps } from "@/lib/sources/http-deps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Intervalo mínimo entre coletas automáticas (o pg_cron chama uma vez por dia). */
const MIN_INTERVAL_MS = 20 * 3_600_000;
/** Categorias por execução: uma volta completa por semana. */
const TARGETS_PER_RUN = 2;
/** Teto diário de chamadas ao TripAdvisor (cota e custo); `GUIDE_TA_DAILY_CALLS` ajusta. */
const DEFAULT_TA_DAILY_CALLS = 150;

function dailyLimit(): number {
  const n = Number(process.env.GUIDE_TA_DAILY_CALLS);
  return Number.isInteger(n) && n >= 0 ? n : DEFAULT_TA_DAILY_CALLS;
}

/**
 * Coleta de lugares do Guia (GUIA-T2). `POST` com `Authorization: Bearer ${CRON_SECRET}`.
 * `?dry=1` só relata o plano; `?force=1` ignora o intervalo mínimo. A chave do TripAdvisor vem só de
 * `process.env.TRIPADVISOR_API_KEY`; sem ela o passo segue em modo de pesquisa web (R33).
 */
export async function POST(req: Request): Promise<Response> {
  if (!isCronAuthorized(req.headers.get("authorization"), process.env.CRON_SECRET))
    return unauthorized();
  const url = new URL(req.url);
  const dry = url.searchParams.get("dry") === "1";
  const force = url.searchParams.get("force") === "1";

  const db = createServiceClient();
  const store = createGuideStore(db);
  const now = new Date();

  if (!dry && !force) {
    const last = await store.lastRunStartedAt("venue_sync");
    if (last && now.getTime() - last.getTime() < MIN_INTERVAL_MS) {
      return Response.json({
        status: "skipped",
        reason: "recent",
        lastStartedAt: last.toISOString(),
      });
    }
  }

  const [templates, lastSynced] = await Promise.all([
    store.templateTargets(),
    store.lastSyncedTargets(),
  ]);
  const only = url.searchParams.get("category");
  const all = allTargets(templates);
  const targets = only
    ? all.filter((t) => t.category === only)
    : pickTargets(all, lastSynced, TARGETS_PER_RUN);
  if (dry) return Response.json({ status: "dry", targets, taDailyLimit: dailyLimit() });

  const runId = await store.startRun("venue_sync", force ? "manual" : "cron", now);
  let taMade = 0;
  const providers = buildProviders({ onTaCall: () => (taMade += 1) });
  const crawl = crawlDeps({ repo: createIngestRepo(db) });
  const used = await store.taCallsToday(now);
  const report = await runVenueSync(
    {
      osm: providers.osm,
      tripadvisor: providers.tripadvisor,
      site: (website) => fetchSiteFacts(crawl, website),
      store,
      now: () => now,
      taCallsLeft: async () => Math.max(0, dailyLimit() - used),
      taCallsMade: () => taMade,
    },
    { categories: targets, area: "Cuiabá", maxTaDetailsPerCategory: 15 },
  );
  await store.finishRun(runId, report);
  return Response.json({ status: "done", ...report });
}
