import "server-only";
import { createServiceClient } from "@/lib/db/client";
import { createProductionAi } from "@/lib/ai/server";
import { createBreakerStore } from "@/lib/db/breaker-store";
import { createReviewRepo } from "@/lib/db/review-store";
import { createSupabaseMediaStore } from "@/lib/db/media-store";
import { createPushSendStore } from "@/lib/db/push-send-store";
import { pushSender } from "@/lib/push/deps";
import { createStaffPushPort } from "@/lib/db/studio-notifications-store";
import { dispatchStaffUrgent } from "@/lib/studio-notifications/push";
import { createPushSteps } from "@/lib/push/steps";
import {
  createClusterRepo,
  createEventSink,
  createFlags,
  createFrontpageRepo,
  createIngestRepo,
  createMediaRepo,
  createPublishRepo,
  createRateLimitHit,
  createRateLimitPeek,
  createRateLimitPeekKey,
  createRulesSource,
  createRunStore,
  createUnderstandRepo,
} from "@/lib/db/pipeline-store";
import { analyzeImage } from "@/lib/media/analyze";
import { makeVariants } from "@/lib/media/make-variants";
import { createMemoryMediaStore, type MediaStore } from "@/lib/media/store";
import type { CollectNowDeps } from "./collect-now";
import type { DrainDeps } from "./drain";
import type { FastTickDeps } from "./fast-tick";
import { crawlDeps } from "@/lib/sources/http-deps";
import { pipelineQueue } from "./queue";
import { crawlerUserAgent } from "./http";
import { systemResolve } from "./net";
import type { HttpFetch } from "./ports";
import { createRunStep, type StepHandlers } from "./run-step";
import { createExhaustedFetchHandler } from "./steps/fetch";
import {
  createClusterHandlers,
  createForcedPublishHandlers,
  createIngestHandlers,
  createMediaHandlers,
  createPublishHandlers,
  createUnderstandHandlers,
} from "./steps";
import { revalidateTags } from "./revalidate";
import { runHotPins } from "./hot-pins";
import type { ReviewTickDeps } from "./steps/auto-reviewer";
import type { FrontpageDeps } from "./steps/frontpage";
import type { StatusDeps } from "./status";
import type { TickDeps } from "./tick";

/**
 * Storage das cópias de imagem. Produção: Supabase Storage (bucket `media`). A pilha local sem
 * Docker não tem Storage (A-017): `MEDIA_STORE=memory` guarda em memória só no desenvolvimento.
 */
export function productionMediaStore(db: ReturnType<typeof createServiceClient>): MediaStore {
  return process.env.MEDIA_STORE === "memory" && process.env.NODE_ENV !== "production"
    ? createMemoryMediaStore()
    : createSupabaseMediaStore(db);
}

/** Handlers de produção por etapa. As etapas entram aqui conforme as tarefas do P3. */
export function productionHandlers(pushNow: () => Date = () => new Date()): StepHandlers {
  const http: HttpFetch = (url, init) => fetch(url, init);
  const db = createServiceClient();
  const ai = createProductionAi();
  const flags = createFlags(db);
  const ingestRepo = createIngestRepo(db);
  return {
    // Coleta pelo mesmo `crawlDeps` do painel: `fetch` real em produção; com `CRAWLER_FIXTURES=1`
    // fora de produção, as fixtures `*.example` (e2e do painel de fontes, FS-T9), sem rede.
    ...createIngestHandlers({
      ...crawlDeps({ repo: ingestRepo }),
      repo: ingestRepo,
      now: () => new Date(),
    }),
    ...createClusterHandlers({
      repo: createClusterRepo(db),
      embed: ai.embedOne,
      now: () => new Date(),
    }),
    ...createUnderstandHandlers({
      repo: createUnderstandRepo(db),
      callAgent: ai.callAgent,
      promptVersion: ai.promptVersion,
      now: () => new Date(),
    }),
    ...createMediaHandlers({
      repo: createMediaRepo(db),
      store: productionMediaStore(db),
      flags,
      http,
      resolve: systemResolve,
      userAgent: crawlerUserAgent(),
      now: () => new Date(),
      analyze: analyzeImage,
      variants: makeVariants,
    }),
    ...createPublishHandlers({
      repo: createPublishRepo(db),
      rules: createRulesSource(db),
      flags,
      callAgent: ai.callAgent,
      promptVersion: ai.promptVersion,
      embed: ai.embedOne,
      revalidate: revalidateTags,
      now: () => new Date(),
      copyGuard: process.env.AI_PROVIDER !== "fake",
      breaker: createBreakerStore(db),
      afterPublish: () => runHotPins("publish"),
    }),
    // Publicação forçada da fila de revisão (REV-T1): lote de até 50 por mensagem.
    ...createForcedPublishHandlers({
      runBatch: async (jobId, batch) => {
        const { data, error } = await db.rpc("forced_publish_batch", {
          p_job: jobId,
          p_batch: batch,
        });
        if (error) throw new Error(`publicação forçada: ${error.message}`);
        const r = (data ?? {}) as {
          status?: string;
          published?: { id: string; slug: string; topicId: string | null; sectionSlug: string }[];
        };
        return { status: r.status ?? "ok", published: r.published ?? [] };
      },
      revalidate: revalidateTags,
    }),
    // Push (spec 2026-09-28 §12): fila `notify`, sender por PUSH_PROVIDER (fake sem VAPID).
    ...createPushSteps({
      store: createPushSendStore(db),
      sender: pushSender(),
      now: pushNow,
    }),
  };
}

/** Pré-etapa do drain: despacho de envios aprovados, agendados e entregas adiadas (G7). */
export function pushDispatchDue(
  db = createServiceClient(),
  now: () => Date = () => new Date(),
): () => Promise<void> {
  return async () => {
    const { error } = await db.rpc("push_dispatch_due", { p_now: now().toISOString() });
    if (error) throw new Error(`push_dispatch_due: ${error.message}`);
  };
}

/**
 * Pré-etapa do drain: despacho do push do leitor e, depois, a central de notificações da equipe
 * (varredura de revisão vencida etc. e push das urgências para quem optou). A central nunca
 * derruba o drain.
 */
export function drainPrelude(
  pushNow: () => Date = () => new Date(),
  db = createServiceClient(),
): () => Promise<void> {
  const dispatch = pushDispatchDue(db, pushNow);
  return async () => {
    try {
      await dispatch();
    } finally {
      await dispatchStaffUrgent(createStaffPushPort(db), pushSender(), pushNow());
    }
  };
}

export function defaultTickDeps(): TickDeps & { secret: string | undefined } {
  return {
    queue: pipelineQueue(),
    runs: createRunStore(createServiceClient()),
    now: () => new Date(),
    secret: process.env.CRON_SECRET,
  };
}

export function defaultFastTickDeps(): FastTickDeps & { secret: string | undefined } {
  const db = createServiceClient();
  return {
    queue: pipelineQueue(),
    runs: createRunStore(db),
    peekRateLimit: createRateLimitPeek(db),
    now: () => new Date(),
    secret: process.env.CRON_SECRET,
  };
}

/** "Coletar agora" (FS-T6 chama da Server Action, depois de `requireRole("source.manage")`). */
export function defaultCollectNowDeps(actor: string): CollectNowDeps {
  const db = createServiceClient();
  return {
    runs: createRunStore(db),
    queue: pipelineQueue(),
    repo: createIngestRepo(db),
    hitRateLimit: createRateLimitHit(db),
    peekRateLimit: createRateLimitPeekKey(db),
    actor,
  };
}

export function defaultDrainDeps(
  pushNow: () => Date = () => new Date(),
): DrainDeps & { secret: string | undefined } {
  return {
    queue: pipelineQueue(),
    runStep: createRunStep(productionHandlers(pushNow)),
    events: createEventSink(createServiceClient()),
    // `fetch` esgotado varrido para a quarentena conta a falha final da fonte (D-F18).
    onExhausted: createExhaustedFetchHandler({ repo: createIngestRepo(createServiceClient()) }),
    beforeDrain: drainPrelude(pushNow),
    now: () => Date.now(),
    secret: process.env.CRON_SECRET,
  };
}

export function defaultStatusDeps(): StatusDeps & { secret: string | undefined } {
  return {
    runs: createRunStore(createServiceClient()),
    queue: pipelineQueue(),
    now: () => new Date(),
    secret: process.env.CRON_SECRET,
  };
}

/** Revisor automático (AUT-T6): rota `/api/ingest/review-tick`, a cada 5 min. */
export function defaultReviewDeps(): ReviewTickDeps {
  const db = createServiceClient();
  const ai = createProductionAi();
  return {
    repo: createReviewRepo(db),
    flags: createFlags(db),
    callAgent: ai.callAgent,
    promptVersion: () => ai.promptVersion("reviewer"),
    queue: pipelineQueue(),
    revalidate: revalidateTags,
    breaker: createBreakerStore(db),
    now: () => new Date(),
  };
}

/**
 * Passo `frontpage` (HOT-T2): rota `/api/ingest/frontpage`, a cada 20 min. Mesmo `crawlDeps` do
 * painel e da coleta (fixtures `*.example` com `CRAWLER_FIXTURES=1` fora de produção). `signal` é
 * o prazo duro da rota (`maxDuration` 60 s menos a folga).
 */
export function defaultFrontpageDeps(signal?: AbortSignal): FrontpageDeps {
  const repo = createFrontpageRepo(createServiceClient());
  return { ...crawlDeps({ repo }), repo, signal };
}

/** Varredura dos assuntos sem novidade há 7 dias (AUT-T7, `topic_close_stale`). */
export function defaultTopicSweep(): () => Promise<number> {
  const db = createServiceClient();
  return async () => {
    const { data, error } = await db.rpc("topic_close_stale");
    if (error) throw new Error(`topic_close_stale: ${error.message}`);
    return data ?? 0;
  };
}
