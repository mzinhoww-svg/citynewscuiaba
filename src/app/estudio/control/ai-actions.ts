"use server";

import { AI_TEXT as T } from "@/content/pt-BR/ai-control";
import type { StudioResult } from "@/lib/studio/action";
import { runEvaluationCommand, toggleEvalCaseCommand } from "@/lib/studio/ai-eval";

/* Server Actions da IA no Control Center (O14). */

export interface AiActionReply {
  ok: boolean;
  message: string;
}

function reply<O>(r: StudioResult<O>, success: (v: O) => string): AiActionReply {
  if (r.ok) return { ok: true, message: success(r.value) };
  if (r.message) return { ok: false, message: r.message };
  return { ok: false, message: r.error === "forbidden" ? T.forbidden : T.genericError };
}

export async function runEvaluationAction(i: { promptVersion?: number }): Promise<AiActionReply> {
  return reply(await runEvaluationCommand({ agentId: "answer", ...i }), (v) =>
    T.evals.ran(v.gateFailures.length === 0, v.cases),
  );
}

export async function toggleEvalCaseAction(i: {
  id: string;
  active: boolean;
}): Promise<AiActionReply> {
  return reply(await toggleEvalCaseCommand(i), () => T.evals.toggled);
}
