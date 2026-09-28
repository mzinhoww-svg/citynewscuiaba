"use server";

import { parseEmail } from "@/lib/auth/account";
import type { EmailLinkState } from "@/lib/auth/form-state";
import { allowEmailLink, callbackUrl } from "@/lib/auth/links";
import { readerClient } from "@/lib/auth/reader";

/** C04 · Pede o link de nova senha. Resposta sempre neutra. */
export async function recoverAction(
  _prev: EmailLinkState,
  form: FormData,
): Promise<EmailLinkState> {
  const email = parseEmail(form.get("email"));
  if (!email) return { status: "invalid" };
  if (!(await allowEmailLink())) return { status: "rate_limited" };
  const db = await readerClient();
  if (!db) return { status: "unavailable" };
  const { error } = await db.auth.resetPasswordForEmail(email, {
    redirectTo: callbackUrl({ fluxo: "recuperar" }),
  });
  if (error && error.status !== undefined && error.status >= 500) return { status: "unavailable" };
  return { status: "sent", email };
}
