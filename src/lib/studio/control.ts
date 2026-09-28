import "server-only";
import { z } from "zod";
import { CONTROL_TEXT as T } from "@/content/pt-BR/control";
import type { Queue } from "@/lib/pipeline/ports";
import {
  REPROCESS_STEPS,
  reprocess,
  retryQuarantined,
  type ReprocessOutcome,
  type ReprocessRepo,
} from "@/lib/pipeline/reprocess";
import { runNow, type RunNowRepo } from "@/lib/pipeline/run-now";
import { STEP_NAMES, type StepName } from "@/lib/pipeline/types";
import { StudioFailure, studioAction } from "./action";

/*
 * Ações do Control Center (O01, O06, O07): "Executar agora", reprocessar e descartar falhas.
 * Exigem `source.manage` (admin, editor_chefe, operador_ia) e auditam em nome da pessoa. Fila e
 * quarentena só abrem para o servidor: depois da checagem de papel, o acesso usa service role.
 */

interface PipelinePorts {
  queue: Queue;
  reprocessRepo: ReprocessRepo;
  runNowRepo: RunNowRepo;
}

let testPorts: ((actorId: string) => PipelinePorts) | null = null;

/** Testes de integração trocam a fila por uma com namespace. */
export function setControlPortsForTests(f: ((actorId: string) => PipelinePorts) | null): void {
  testPorts = f;
}

async function ports(actorId: string, now: () => Date): Promise<PipelinePorts> {
  if (testPorts) return testPorts(actorId);
  const [{ createServiceClient }, { createReprocessRepo, createRunNowRepo }, { pipelineQueue }] =
    await Promise.all([
      import("@/lib/db/client"),
      import("@/lib/db/control-store"),
      import("@/lib/pipeline/queue"),
    ]);
  const db = createServiceClient();
  return {
    queue: pipelineQueue(),
    reprocessRepo: createReprocessRepo(db, { actorId, now }),
    runNowRepo: createRunNowRepo(db),
  };
}

const noScope = () => ({});

const RunNowInput = z.object({ sourceId: z.uuid().optional() });

export const runNowCommand = studioAction(
  "source.manage",
  noScope,
  async (i: z.infer<typeof RunNowInput>, ctx) => {
    const p = await ports(ctx.userId, ctx.now);
    const r = await runNow(
      { queue: p.queue, repo: p.runNowRepo, now: ctx.now },
      { requestedBy: ctx.userId, ...(i.sourceId ? { sourceId: i.sourceId } : {}) },
    );
    if (!r.ok) {
      const msg =
        r.error === "collecting"
          ? T.overview.runNowCollecting
          : r.error === "source_inactive"
            ? T.overview.runNowInactive
            : T.overview.runNowNotFound;
      throw new StudioFailure(r.error === "not_found" ? "not_found" : "conflict", msg);
    }
    ctx.setObjectRef(`run:${r.value.runId}`);
    ctx.detail({ enqueued: r.value.enqueued, sourceId: i.sourceId ?? null });
    return r.value;
  },
  { schema: RunNowInput, auditAs: "pipeline.run_now", objectRef: () => "run:" },
);

const stepEnum = z.enum(STEP_NAMES).refine((s) => REPROCESS_STEPS.includes(s), T.reprocess.invalid);

const ReprocessInput = z
  .object({
    runId: z.uuid().optional(),
    itemIds: z.array(z.uuid()).max(500).optional(),
    sourceId: z.uuid().optional(),
    fromStep: stepEnum,
    keepHumanDecisions: z.boolean().default(true),
  })
  .refine((i) => i.runId || i.sourceId || (i.itemIds?.length ?? 0) > 0, T.reprocess.invalid);

export const reprocessCommand = studioAction(
  "source.manage",
  noScope,
  async (i: z.infer<typeof ReprocessInput>, ctx): Promise<ReprocessOutcome> => {
    const p = await ports(ctx.userId, ctx.now);
    const scope = {
      ...(i.runId ? { runId: i.runId } : {}),
      ...(i.itemIds?.length ? { itemIds: i.itemIds } : {}),
      ...(i.sourceId ? { sourceId: i.sourceId } : {}),
    };
    const r = await reprocess(
      { queue: p.queue, repo: p.reprocessRepo, now: ctx.now },
      { scope, fromStep: i.fromStep as StepName, keepHumanDecisions: i.keepHumanDecisions },
    );
    if (!r.ok) throw new StudioFailure("invalid", T.reprocess.invalid);
    ctx.setObjectRef(i.runId ? `run:${i.runId}` : i.sourceId ? `source:${i.sourceId}` : "items:");
    ctx.detail({
      scope,
      fromStep: i.fromStep,
      keepHumanDecisions: i.keepHumanDecisions,
      ...r.value,
    });
    return r.value;
  },
  { schema: ReprocessInput, auditAs: "pipeline.reprocess", objectRef: () => "run:" },
);

const QuarantineInput = z.object({
  ids: z.array(z.number().int().positive()).min(1, T.failures.nothingSelected).max(500),
  keepHumanDecisions: z.boolean().default(true),
});

export const retryQuarantineCommand = studioAction(
  "source.manage",
  noScope,
  async (i: z.infer<typeof QuarantineInput>, ctx): Promise<ReprocessOutcome> => {
    const p = await ports(ctx.userId, ctx.now);
    const r = await retryQuarantined(
      { queue: p.queue, repo: p.reprocessRepo, now: ctx.now },
      { ids: i.ids, keepHumanDecisions: i.keepHumanDecisions },
    );
    if (!r.ok) throw new StudioFailure("invalid", T.failures.nothingSelected);
    ctx.detail({ quarantine: i.ids, keepHumanDecisions: i.keepHumanDecisions, ...r.value });
    return r.value;
  },
  { schema: QuarantineInput, auditAs: "pipeline.reprocess", objectRef: () => "quarantine:" },
);

const DiscardInput = z.object({
  ids: z.array(z.number().int().positive()).min(1, T.failures.nothingSelected).max(500),
  reason: z.string().trim().min(1, T.failures.reasonRequired).max(500),
});

export const discardQuarantineCommand = studioAction(
  "source.manage",
  noScope,
  async (i: z.infer<typeof DiscardInput>, ctx): Promise<number> => {
    const p = await ports(ctx.userId, ctx.now);
    const n = await p.reprocessRepo.resolveQuarantine(i.ids);
    ctx.detail({ quarantine: i.ids, reason: i.reason, discarded: n });
    return n;
  },
  {
    schema: DiscardInput,
    auditAs: "pipeline.quarantine.discard",
    objectRef: () => "quarantine:",
  },
);
