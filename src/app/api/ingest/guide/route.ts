import { createProductionAi } from "@/lib/ai/server";
import { createServiceClient } from "@/lib/db/client";
import { createGuideArticleStore } from "@/lib/db/guide-article-store";
import { guideSystemAudit } from "@/lib/db/guide-audit";
import { createLifecycleStore } from "@/lib/db/guide-lifecycle-store";
import { createGuideListStore } from "@/lib/db/guide-list-store";
import { createGuideStore } from "@/lib/db/guide-store";
import { proposeNextTemplate } from "@/lib/guide/engine";
import { writeListArticle } from "@/lib/guide/article";
import { autoPublishList, refreshDue } from "@/lib/guide/lifecycle";
import { guideTags } from "@/lib/guide/tags";
import { needsArticle, writeDueArticles } from "@/lib/guide/write-step";
import { revalidateTags } from "@/lib/pipeline/revalidate";
import { isCronAuthorized, unauthorized } from "@/lib/security/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Intervalo mínimo entre propostas automáticas (o pg_cron chama segunda, quarta e sexta). */
const MIN_PROPOSE_INTERVAL_MS = 20 * 3_600_000;
/** Listas atualizadas por chamada do cron diário. */
const REFRESH_PER_RUN = 5;
/** Textos escritos por chamada (cada um é uma chamada de modelo de até 45 s). */
const WRITE_PER_RUN = 1;

/**
 * Cron do Guia, `POST` com `Authorization: Bearer ${CRON_SECRET}`.
 * - `?mode=propose` (GUIA-T4): monta a lista do próximo modelo (3 por semana) e, se ela cumpre
 *   todas as regras e o interruptor `guide_auto_publish` está ligado, publica sozinha (GUIA-T7).
 * - `?mode=refresh` (GUIA-T7): reordena as listas com mais de 90 dias e atualiza "Atualizada em";
 *   a que deixa de cumprir as regras vai para suspensa até uma pessoa decidir.
 * - `?mode=write` (A-214): escreve o texto de abertura e os comentários das listas publicadas sem
 *   texto ou com lugares novos; o texto do modelo é conferido e, reprovado, vira o texto montado.
 * `?dry=1` só relata; `?force=1` ignora o intervalo mínimo.
 */
export async function POST(req: Request): Promise<Response> {
  if (!isCronAuthorized(req.headers.get("authorization"), process.env.CRON_SECRET))
    return unauthorized();
  const url = new URL(req.url);
  const mode = url.searchParams.get("mode") ?? "propose";
  const dry = url.searchParams.get("dry") === "1";
  const force = url.searchParams.get("force") === "1";
  if (mode !== "propose" && mode !== "refresh" && mode !== "write")
    return Response.json({ status: "error", reason: "modo desconhecido" }, { status: 400 });

  const db = createServiceClient();
  const runs = createGuideStore(db);
  const lists = createGuideListStore(db);
  const lifecycle = createLifecycleStore(db);
  const now = new Date();

  if (mode === "write") {
    const store = createGuideArticleStore(db);
    if (dry) {
      const due = (await store.published()).filter(needsArticle);
      return Response.json({ status: "dry", due: due.map((l) => l.slug) });
    }
    const ai = createProductionAi();
    const out = await writeDueArticles(
      {
        ...store,
        // Uma tentativa por chamada: a rota tem 60 s e o modelo leva até 45 s.
        write: (input, opts) =>
          writeListArticle(
            {
              callAgent: ai.callAgent,
              signal: req.signal,
              attempts: 1,
              fallback: opts.fallback,
              previous: opts.previous,
            },
            input,
          ),
        revalidate: revalidateTags,
      },
      WRITE_PER_RUN,
    );
    return Response.json({ status: "done", written: out });
  }

  if (mode === "refresh") {
    if (dry) {
      const due = await lifecycle.due(now, REFRESH_PER_RUN);
      return Response.json({ status: "dry", due: due.map((l) => l.slug) });
    }
    const runId = await runs.startRun("refresh", force ? "manual" : "cron", now);
    const out = await refreshDue(
      {
        ...lifecycle.refreshDeps(() => now),
        due: lifecycle.due,
        revalidate: revalidateTags,
      },
      REFRESH_PER_RUN,
    );
    const report = { refreshed: out.length, lists: out };
    await runs.finishRun(runId, report);
    return Response.json({ status: "done", ...report });
  }

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
  const publishDeps = lifecycle.autoPublishDeps(() => now);
  const outcome = await proposeNextTemplate({
    store: lists,
    now: () => now,
    afterPropose: async (r) => {
      const res = await autoPublishList(publishDeps, r);
      if (res.published) {
        await revalidateTags([
          guideTags.index,
          guideTags.list(r.proposal.slug),
          ...r.proposal.items.flatMap((i) => {
            const v = r.venues.find((x) => x.id === i.venueId);
            return v ? [guideTags.venue(v.slug)] : [];
          }),
          "sitemap",
        ]);
      }
      return { published: res.published };
    },
  });
  if (outcome.status === "proposed") {
    await guideSystemAudit(db, "guide.propose", `guide_list:${outcome.listId}`, {
      template: outcome.template,
      items: outcome.items,
      autoPublishable: outcome.autoPublishable,
      published: outcome.published,
      missing: outcome.missing,
    });
  }
  await runs.finishRun(runId, outcome);
  return Response.json({ ...outcome });
}
