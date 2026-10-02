"use server";

import { redirect } from "next/navigation";
import { confirmEmailAlerts } from "@/lib/db/writes";
import { verifyNewsletterToken } from "@/lib/newsletter/token";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Confirma o alerta por e-mail (P18) só com o toque no botão: robôs de e-mail que abrem o link
 * não confirmam nada (gate P2, I6; mesmo motivo de A-057).
 */
export async function confirmAlertAction(form: FormData): Promise<void> {
  const v = verifyNewsletterToken(String(form.get("token") ?? ""), "alert");
  if (!v.ok)
    redirect(`/alertas/confirmar?estado=${v.error === "expired" ? "expirado" : "invalido"}`);
  const ids = v.value.lists.flatMap((l) =>
    l.startsWith("alert:") && UUID.test(l.slice(6)) ? [l.slice(6)] : [],
  );
  const r = ids.length ? await confirmEmailAlerts(v.value.email, ids) : null;
  if (r?.ok === false) redirect("/alertas/confirmar?estado=erro");
  if (!r || r.value === 0) redirect("/alertas/confirmar?estado=invalido");
  redirect("/alertas/confirmar?estado=confirmado");
}
