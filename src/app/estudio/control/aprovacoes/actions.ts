"use server";

import { redirect } from "next/navigation";
import { approve, reject } from "@/lib/approvals";

/*
 * Server Actions da tela de aprovações: decidem pelo domínio (src/lib/approvals, que confere
 * pessoa, papel e estado no banco e audita) e voltam para a lista com o resultado no endereço.
 */
const BACK = "/estudio/control/aprovacoes";

async function decide(formData: FormData, how: "approve" | "reject"): Promise<never> {
  const id = String(formData.get("id") ?? "");
  const r = how === "approve" ? await approve({ id }) : await reject({ id });
  if (r.ok) redirect(`${BACK}?ok=${how === "approve" ? "aprovada" : "recusada"}`);
  redirect(`${BACK}?erro=${r.error}`);
}

export async function approveApprovalAction(formData: FormData): Promise<void> {
  await decide(formData, "approve");
}

export async function rejectApprovalAction(formData: FormData): Promise<void> {
  await decide(formData, "reject");
}
