"use server";

import { revalidatePath } from "next/cache";
import { flash, requireAreaInAction } from "@/lib/admin/guard";
import { sendUrgentPush, requestPushApproval } from "@/lib/admin/writes";

const BACK = "/estudio/admin/notificacoes";

export async function requestPushApprovalAction(formData: FormData): Promise<void> {
  await requireAreaInAction("notificacoes", BACK);
  const r = await requestPushApproval(
    String(formData.get("articleId") ?? ""),
    String(formData.get("justification") ?? ""),
  );
  revalidatePath(BACK);
  revalidatePath("/estudio/control/aprovacoes");
  if (r.ok) flash(BACK, "ok", "pedido");
  flash(BACK, "erro", r.error === "forbidden" ? "forbidden" : "invalid");
}

export async function sendUrgentPushAction(formData: FormData): Promise<void> {
  await requireAreaInAction("notificacoes", BACK);
  const r = await sendUrgentPush(String(formData.get("articleId") ?? ""));
  revalidatePath(BACK);
  if (r === "queued") flash(BACK, "ok", "enviado");
  flash(BACK, "erro", r);
}
