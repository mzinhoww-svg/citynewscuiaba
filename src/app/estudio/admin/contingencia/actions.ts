"use server";

import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/components";
import { ACTIONS_BY_KEY, FLAG_ERRORS } from "@/content/pt-BR/contingency";
import { requireAreaInAction } from "@/lib/admin/guard";
import { CONTINGENCY_KEYS, setFlag, type ContingencyKey } from "@/lib/flags";

const BACK = "/estudio/admin/contingencia";

const isContingencyKey = (k: string): k is ContingencyKey =>
  (CONTINGENCY_KEYS as readonly string[]).includes(k);

/**
 * Botões de contingência (A15). Passa por `requireAreaInAction` com `allowReadOnly`: a tela de
 * contingência é a única que escreve em modo leitura, para poder desligá-lo. `setFlag` exige
 * admin, audita ator, valor e motivo e nunca toca salvaguardas de segurança.
 */
export async function setContingencyAction(form: FormData): Promise<ActionResult> {
  const session = await requireAreaInAction("contingencia", BACK, { allowReadOnly: true });
  const key = String(form.get("key") ?? "");
  const raw = String(form.get("value") ?? "");
  const reason = String(form.get("reason") ?? "").trim();
  if (!isContingencyKey(key) || (raw !== "true" && raw !== "false"))
    return { ok: false, message: FLAG_ERRORS.invalid_key };
  if (reason === "") return { ok: false, message: FLAG_ERRORS.unavailable };
  const value = raw === "true";
  const pair = ACTIONS_BY_KEY[key];
  const spec = pair.stop.value === value ? pair.stop : pair.resume;
  const r = await setFlag(key, value, { userId: session.userId, roles: session.roles }, reason);
  if (!r.ok) return { ok: false, message: FLAG_ERRORS[r.error] };
  revalidatePath(BACK);
  return { ok: true, message: spec.done };
}
