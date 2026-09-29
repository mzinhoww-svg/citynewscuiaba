"use server";

import { revalidatePath } from "next/cache";
import { RULES_ADMIN_TEXT as T } from "@/content/pt-BR/control-rules";
import {
  proposeRules,
  simulateProposal,
  type ProposeInput,
  type RulesDraft,
  type SimulationReport,
} from "@/lib/studio/rules";

/*
 * Server Actions da tela de regras: camada fina sobre src/lib/studio/rules (papel, validação,
 * aprovações e auditoria ficam lá). Devolvem texto pronto para a região de status.
 */

export type SimulateReply = { ok: true; report: SimulationReport } | { ok: false; message: string };

export type ProposeReply = { ok: true; version: number } | { ok: false; message: string };

export async function simulateRulesAction(rules: RulesDraft): Promise<SimulateReply> {
  try {
    const r = await simulateProposal({ rules });
    return r.ok ? { ok: true, report: r.value } : { ok: false, message: r.message };
  } catch (e) {
    console.error("estudio regras (simulação):", e instanceof Error ? e.message : e);
    return { ok: false, message: T.simulateError };
  }
}

export async function proposeRulesAction(input: ProposeInput): Promise<ProposeReply> {
  const r = await proposeRules(input);
  if (!r.ok)
    return {
      ok: false,
      message: r.message ?? (r.error === "forbidden" ? T.forbidden : T.invalidDraft),
    };
  revalidatePath("/estudio/control/regras");
  revalidatePath("/estudio/control/aprovacoes");
  return { ok: true, version: r.value.version };
}
