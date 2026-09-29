"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { MONITOR_TEXT } from "@/content/pt-BR/control-monitor";
import { isStepName } from "@/lib/control/monitor";
import { ReprocessError, reprocess } from "@/lib/pipeline/reprocess";

/*
 * Reprocessa o ciclo a partir de uma etapa. Mantém as decisões humanas por padrão; para descartá-las
 * é preciso desmarcar a opção e digitar "reprocessar" (confirmação de ação destrutiva).
 */
export async function reprocessRunAction(formData: FormData): Promise<void> {
  const runId = String(formData.get("runId") ?? "");
  const back = `/estudio/control/execucoes/${encodeURIComponent(runId)}`;
  const step = String(formData.get("fromStep") ?? "");
  const keep = formData.get("keep") === "on";
  const typed = String(formData.get("confirmacao") ?? "")
    .trim()
    .toLowerCase();
  if (!isStepName(step) || (!keep && typed !== MONITOR_TEXT.reprocess.confirmWord))
    redirect(`${back}?erro=invalid`);

  let enqueued = 0;
  try {
    ({ enqueued } = await reprocess({
      scope: { runId },
      fromStep: step,
      keepHumanDecisions: keep,
    }));
  } catch (e) {
    if (e instanceof ReprocessError) redirect(`${back}?erro=${e.code}`);
    console.error("estudio execução (reprocessar):", e instanceof Error ? e.message : e);
    redirect(`${back}?erro=failed`);
  }
  revalidatePath(back);
  redirect(`${back}?ok=${enqueued}`);
}
