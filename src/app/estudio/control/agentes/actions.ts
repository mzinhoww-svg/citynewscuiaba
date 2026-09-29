"use server";

import { redirect } from "next/navigation";
import { setAgentEnabled } from "@/lib/ai/prompts";

/*
 * Liga ou desliga só o agente (a flag global `ai_enabled` é da Governança). O domínio confere o
 * papel (admin e operação de IA), grava a mudança e audita; a tela volta com o resultado no
 * endereço.
 */
const BACK = "/estudio/control/agentes";

export async function toggleAgentAction(formData: FormData): Promise<void> {
  const agentId = String(formData.get("agentId") ?? "");
  const enabled = formData.get("enabled") === "true";
  const r = await setAgentEnabled({ agentId, enabled });
  if (r.ok)
    redirect(
      `${BACK}?ok=${enabled ? "ligado" : "desligado"}&agente=${encodeURIComponent(agentId)}`,
    );
  redirect(`${BACK}?erro=${r.error}`);
}
