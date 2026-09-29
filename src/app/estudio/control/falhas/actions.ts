"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isStepName } from "@/lib/control/monitor";
import { ReprocessError, reprocess } from "@/lib/pipeline/reprocess";

/*
 * Reprocessa um item da quarentena (mesma etapa em que parou). Papel, auditoria e fila ficam em
 * src/lib/pipeline/reprocess. Volta para a lista com o resultado no endereço.
 */
const BACK = "/estudio/control/falhas";

export async function reprocessItemAction(formData: FormData): Promise<void> {
  const ref = String(formData.get("ref") ?? "");
  const step = String(formData.get("step") ?? "");
  if (!isStepName(step)) redirect(`${BACK}?erro=invalid`);
  let enqueued = 0;
  try {
    ({ enqueued } = await reprocess({
      scope: { itemIds: [ref] },
      fromStep: step,
      keepHumanDecisions: true,
    }));
  } catch (e) {
    if (e instanceof ReprocessError) redirect(`${BACK}?erro=${e.code}`);
    console.error("estudio falhas (reprocessar):", e instanceof Error ? e.message : e);
    redirect(`${BACK}?erro=failed`);
  }
  revalidatePath(BACK);
  redirect(`${BACK}?ok=${enqueued}`);
}
