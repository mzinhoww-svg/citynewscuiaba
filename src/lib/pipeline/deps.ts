import "server-only";
import { createServiceClient } from "@/lib/db/client";
import { createProductionAi } from "@/lib/ai/server";
import {
  createClusterRepo,
  createEventSink,
  createIngestRepo,
  createRunStore,
  createUnderstandRepo,
} from "@/lib/db/pipeline-store";
import type { DrainDeps } from "./drain";
import { pipelineQueue } from "./queue";
import { crawlerUserAgent } from "./http";
import type { HttpFetch } from "./ports";
import { createRunStep, type StepHandlers } from "./run-step";
import { createClusterHandlers, createIngestHandlers, createUnderstandHandlers } from "./steps";
import type { TickDeps } from "./tick";

/** Handlers de produção por etapa. As etapas entram aqui conforme as tarefas do P3. */
export function productionHandlers(): StepHandlers {
  const http: HttpFetch = (url, init) => fetch(url, init);
  const db = createServiceClient();
  const ai = createProductionAi();
  return {
    ...createIngestHandlers({
      repo: createIngestRepo(db),
      http,
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

export function defaultDrainDeps(): DrainDeps & { secret: string | undefined } {
  return {
    queue: pipelineQueue(),
    runStep: createRunStep(productionHandlers()),
    events: createEventSink(createServiceClient()),
    now: () => Date.now(),
    secret: process.env.CRON_SECRET,
  };
}
