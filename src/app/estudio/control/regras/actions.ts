"use server";

import { RULES_TEXT as T } from "@/content/pt-BR/rules-admin";
import type { RuleSetDraft, SimulationView } from "@/components/estudio";
import { proposeRulesCommand, simulateRulesCommand } from "@/lib/studio/rules";

/* Server Actions da tela de regras (P5-T2): camada fina sobre src/lib/studio/rules. */

export async function simulateRulesAction(
  draft: RuleSetDraft,
): Promise<{ ok: boolean; message: string; simulation?: SimulationView }> {
  const r = await simulateRulesCommand(draft);
  if (!r.ok) return { ok: false, message: r.message ?? T.form.genericError };
  const { changed, total, byRoute, diff } = r.value;
  return {
    ok: true,
    message: T.form.result(changed, total),
    simulation: { changed, total, byRoute, diff },
  };
}

export async function proposeRulesAction(i: {
  rules: RuleSetDraft;
  justification: string;
}): Promise<{ ok: true; message: string } | { ok: false; message: string }> {
  const r = await proposeRulesCommand(i);
  if (!r.ok) return { ok: false, message: r.message ?? T.form.genericError };
  const msg = T.form.proposed(r.value.version);
  return { ok: true, message: r.value.approvalId ? msg : `${msg} ${T.form.approvalFailed}` };
}
