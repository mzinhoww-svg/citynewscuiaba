import { createServiceClient } from "@/lib/db/client";
import { guideSystemAudit } from "@/lib/db/guide-audit";
import { createGuideListStore } from "@/lib/db/guide-list-store";
import { createGuideStore } from "@/lib/db/guide-store";
import { proposeNextTemplate } from "@/lib/guide/engine";
import { isCronAuthorized, unauthorized } from "@/lib/security/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Intervalo mínimo entre propostas automáticas (o pg_cron chama segunda, quarta e sexta). */
const MIN_PROPOSE_INTERVAL_MS = 20 * 3_600_000;

/**
 * Propostas do Guia (GUIA-T4). `POST ?mode=propose` com `Authorization: Bearer ${CRON_SECRET}`
 * monta a lista do próximo modelo do catálogo (3 por semana). `?dry=1` só relata o modelo
 * escolhido; `?force=1` ignora o intervalo mínimo.
 */
export async function POST(req: Request): Promise<Response> {
  if (!isCronAuthorized(req.headers.get("authorization"), process.env.CRON_SECRET))
    return unauthorized();
  const url = new URL(req.url);
  const mode = url.searchParams.get("mode") ?? "propose";
  const dry = url.searchParams.get("dry") === "1";
  const force = url.searchParams.get("force") === "1";
  if (mode !== "propose")
    return Response.json({ status: "error", reason: "modo desconhecido" }, { status: 400 });

  const db = createServiceClient();
  const runs = createGuideStore(db);
  const lists = createGuideListStore(db);
  const now = new Date();

  if (dry) {
    const next = await lists.nextTemplate(now);
    return Response.json({ status: "dry", next: next?.slug ?? null });
  }
  if (!force) {
    const last = await runs.lastRunStartedAt("propose");
    if (last && now.getTime() - last.getTime() < MIN_PROPOSE_INTERVAL_MS) {
      return Response.json({
        status: "skipped",
        reason: "recent",
        lastStartedAt: last.toISOString(),
      });
    }
  }

  const runId = await runs.startRun("propose", force ? "manual" : "cron", now);
  const outcome = await proposeNextTemplate({ store: lists, now: () => now });
  if (outcome.status === "proposed") {
    await guideSystemAudit(db, "guide.propose", `guide_list:${outcome.listId}`, {
      template: outcome.template,
      items: outcome.items,
      autoPublishable: outcome.autoPublishable,
      missing: outcome.missing,
    });
  }
  await runs.finishRun(runId, outcome);
  return Response.json({ ...outcome });
}
