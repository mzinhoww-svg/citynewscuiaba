import "server-only";
import { createServiceClient } from "@/lib/db/client";
import { createEventSink, createRunStore } from "@/lib/db/pipeline-store";
import type { DrainDeps } from "./drain";
import { pipelineQueue } from "./queue";
import { createRunStep, type StepHandlers } from "./run-step";
import type { TickDeps } from "./tick";

/** Handlers de produção por etapa. As etapas entram aqui conforme as tarefas do P3. */
export function productionHandlers(): StepHandlers {
  return {};
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
