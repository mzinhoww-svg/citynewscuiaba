import "server-only";
import { createServiceClient } from "@/lib/db/client";
import { createProductionAi } from "@/lib/ai/server";
import { createSupabaseMediaStore } from "@/lib/db/media-store";
import {
  createClusterRepo,
  createEventSink,
  createFlags,
  createIngestRepo,
  createMediaRepo,
  createPublishRepo,
  createRateLimitHit,
  createRateLimitPeek,
  createRulesSource,
  createRunStore,
  createUnderstandRepo,
} from "@/lib/db/pipeline-store";
import { analyzeImage } from "@/lib/media/analyze";
import { createMemoryMediaStore, type MediaStore } from "@/lib/media/store";
import type { CollectNowDeps } from "./collect-now";
import type { DrainDeps } from "./drain";
import type { FastTickDeps } from "./fast-tick";
import { pipelineQueue } from "./queue";
import { crawlerUserAgent } from "./http";
import { systemResolve } from "./net";
import type { HttpFetch } from "./ports";
import { createRunStep, type StepHandlers } from "./run-step";
import {
  createClusterHandlers,
  createIngestHandlers,
  createMediaHandlers,
  createPublishHandlers,
  createUnderstandHandlers,
} from "./steps";
import { revalidateTags } from "./revalidate";
import type { StatusDeps } from "./status";
import type { TickDeps } from "./tick";

/**
 * Storage das cópias de imagem. Produção: Supabase Storage (bucket `media`). A pilha local sem
 * Docker não tem Storage (A-017): `MEDIA_STORE=memory` guarda em memória só no desenvolvimento.
 */
function productionMediaStore(db: ReturnType<typeof createServiceClient>): MediaStore {
  return process.env.MEDIA_STORE === "memory" && process.env.NODE_ENV !== "production"
    ? createMemoryMediaStore()
    : createSupabaseMediaStore(db);
}

/** Handlers de produção por etapa. As etapas entram aqui conforme as tarefas do P3. */
export function productionHandlers(): StepHandlers {
  const http: HttpFetch = (url, init) => fetch(url, init);
  const db = createServiceClient();
  const ai = createProductionAi();
  const flags = createFlags(db);
  return {
    ...createIngestHandlers({
      repo: createIngestRepo(db),
      http,
      resolve: systemResolve,
      userAgent: crawlerUserAgent(),
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
    }),
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
    actor,
  };
}

export function defaultDrainDeps(): DrainDeps & { secret: string | undefined } {
  return {
    queue: pipelineQueue(),
    runStep: createRunStep(productionHandlers()),
    events: createEventSink(createServiceClient()),
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
