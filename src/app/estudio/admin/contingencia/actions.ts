"use server";

import { CONTINGENCY_TEXT as T, type ContingencyAction } from "@/content/pt-BR/contingency";
import { contingencyCommand } from "@/lib/studio/contingency";

/* Server Action da Contingência (A15): camada fina sobre src/lib/studio/contingency. */

export async function contingencyAction(i: {
  action: ContingencyAction;
  typed: string;
  reason: string;
}): Promise<{ ok: boolean; message: string }> {
  const r = await contingencyCommand(i);
  if (!r.ok) return { ok: false, message: r.message ?? T.error.generic };
  const v = r.value;
  switch (v.action) {
    case "pause_auto_publish":
      return {
        ok: true,
        message: v.changed ? T.result.pause_auto_publish(v.movedToReview) : T.result.unchanged,
      };
    case "resume_auto_publish":
      return { ok: true, message: v.changed ? T.result.resume_auto_publish : T.result.unchanged };
    case "rollback_rules":
      return { ok: true, message: T.result.rollback_rules(v.from, v.to) };
    default:
      return { ok: true, message: v.changed ? T.result[v.action] : T.result.unchanged };
  }
}
