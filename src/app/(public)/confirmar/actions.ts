"use server";

import type { EmailOtpType } from "@supabase/supabase-js";
import { parseEmail } from "@/lib/auth/account";
import type { ConfirmState, EmailLinkState } from "@/lib/auth/form-state";
import { allowEmailLink, callbackUrl } from "@/lib/auth/links";
import { readerClient } from "@/lib/auth/reader";
import { ensureProfile } from "@/lib/db/account";

const TYPES: readonly EmailOtpType[] = ["signup", "email", "invite", "email_change"];

/**
 * C05 · Confirma o e-mail pelo `token` do link (hash do Auth). Só com o toque no botão: robôs
 * de e-mail que abrem links não gastam o token.
 */
export async function confirmAction(_prev: ConfirmState, form: FormData): Promise<ConfirmState> {
  const token = String(form.get("token") ?? "").trim();
  const type = TYPES.find((t) => t === form.get("type")) ?? "email";
  if (!token || token.length > 200) return { status: "expired" };
  const db = await readerClient();
  if (!db) return { status: "unavailable" };
  const { data, error } = await db.auth.verifyOtp({ token_hash: token, type });
  if (error || !data.user) {
    return error?.status !== undefined && error.status >= 500
      ? { status: "unavailable" }
      : { status: "expired" };
  }
  await ensureProfile(db, data.user);
  return { status: "confirmed" };
}

/** C05 · Reenvia a confirmação do cadastro. Resposta sempre neutra. */
export async function resendConfirmAction(
  _prev: EmailLinkState,
  form: FormData,
): Promise<EmailLinkState> {
  const email = parseEmail(form.get("email"));
  if (!email) return { status: "invalid" };
  if (!(await allowEmailLink())) return { status: "rate_limited" };
  const db = await readerClient();
  if (!db) return { status: "unavailable" };
  const { error } = await db.auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo: callbackUrl({ fluxo: "cadastro" }) },
  });
  if (error && error.status !== undefined && error.status >= 500) return { status: "unavailable" };
  return { status: "sent", email };
}
