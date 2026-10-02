"use server";

import { CONTROL_TEXT as T } from "@/content/pt-BR/control";
import type { StudioResult } from "@/lib/studio/action";
import {
  discardQuarantineCommand,
  reprocessCommand,
  retryQuarantineCommand,
  runNowCommand,
} from "@/lib/studio/control";

/* Server Actions do Control Center: camada fina sobre src/lib/studio/control. */

export interface ControlActionReply {
  ok: boolean;
  message: string;
}

function reply<O>(r: StudioResult<O>, success: (v: O) => string): ControlActionReply {
  if (r.ok) return { ok: true, message: success(r.value) };
  if (r.message) return { ok: false, message: r.message };
  return { ok: false, message: r.error === "forbidden" ? T.forbidden : T.genericError };
}

export async function runNowAction(i: { sourceId?: string }): Promise<ControlActionReply> {
  return reply(await runNowCommand(i), (v) => T.overview.runNowOk(v.enqueued));
}

export async function reprocessRunAction(i: {
  runId: string;
  fromStep: string;
  keepHumanDecisions: boolean;
}): Promise<ControlActionReply> {
  return reply(
    await reprocessCommand({
      runId: i.runId,
      fromStep: i.fromStep as Parameters<typeof reprocessCommand>[0]["fromStep"],
      keepHumanDecisions: i.keepHumanDecisions,
    }),
    T.reprocess.result,
  );
}

export async function retryQuarantineAction(i: {
  ids: number[];
  keepHumanDecisions: boolean;
}): Promise<ControlActionReply> {
  return reply(await retryQuarantineCommand(i), T.reprocess.result);
}

export async function discardQuarantineAction(i: {
  ids: number[];
  reason: string;
}): Promise<ControlActionReply> {
  return reply(await discardQuarantineCommand(i), T.failures.discarded);
}
