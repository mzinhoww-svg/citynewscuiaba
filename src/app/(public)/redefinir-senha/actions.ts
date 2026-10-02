"use server";

import { redirect } from "next/navigation";
import { parseNewPassword } from "@/lib/auth/account";
import type { NewPasswordState } from "@/lib/auth/form-state";
import { getReader } from "@/lib/auth/reader";

/**
 * C04 · Nova senha: vale para a sessão aberta pelo link de recuperação (ou para quem já entrou,
 * em Perfil). Depois de salvar, o leitor continua na conta ("login automático").
 */
export async function newPasswordAction(
  _prev: NewPasswordState,
  form: FormData,
): Promise<NewPasswordState> {
  const parsed = parseNewPassword({ password: form.get("password"), confirm: form.get("confirm") });
  if (!parsed.ok)
    return { status: "invalid", field: parsed.error.password ? "password" : "confirm" };
  const reader = await getReader();
  if (!reader) return { status: "expired" };
  const { error } = await reader.db.auth.updateUser({ password: parsed.value });
  if (error) {
    if (error.code === "weak_password" || error.code === "same_password")
      return { status: "invalid", field: "password" };
    return { status: "unavailable" };
  }
  redirect("/perfil?senha=alterada");
}
