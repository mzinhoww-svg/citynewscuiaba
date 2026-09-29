"use server";

import { AI_OPS_TEXT as T } from "@/content/pt-BR/control-ai-ops";
import { executeRegression } from "@/lib/ai/eval-run";

export type EvalActionReply = { ok: true; promptVersion: number } | { ok: false; message: string };

/* Camada fina: papel, prompt, execução, registro e auditoria ficam em `executeRegression`. */
export async function runEvalAction(input: {
  agentId: string;
  promptVersion: number;
}): Promise<EvalActionReply> {
  try {
    const r = await executeRegression(input);
    return r.ok ? { ok: true, promptVersion: r.promptVersion } : { ok: false, message: r.message };
  } catch (e) {
    console.error("estudio avaliacoes:", e instanceof Error ? e.message : e);
    return { ok: false, message: T.runFailed };
  }
}
