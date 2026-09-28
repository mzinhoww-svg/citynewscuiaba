"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { parseSignUp, safeNext } from "@/lib/auth/account";
import type { SignUpState } from "@/lib/auth/form-state";
import { afterLogin, allowEmailLink, callbackUrl } from "@/lib/auth/links";
import { readerClient } from "@/lib/auth/reader";
import { ensureProfile } from "@/lib/db/account";
import { subscribeDeps } from "@/lib/newsletter/server";
import {
  LISTS_PICKED_FIELD,
  NEWSLETTER_LIST,
  subscribeNewsletter,
} from "@/lib/newsletter/subscribe";

/**
 * C03 · Criar conta: só nome de exibição, e-mail, senha (≥ 8), termos e newsletter opcional
 * (spec §5.4). Com confirmação de e-mail ligada no Auth, a conta espera o link; sem ela, já
 * entra e segue para a migração. A newsletter usa a mesma confirmação dupla do P19.
 */
export async function signUpAction(_prev: SignUpState, form: FormData): Promise<SignUpState> {
  const parsed = parseSignUp({
    name: form.get("name"),
    email: form.get("email"),
    password: form.get("password"),
    terms: form.get("terms"),
    newsletter: form.get("newsletter"),
  });
  if (!parsed.ok) return { status: "invalid", fields: parsed.error };
  const { name, email, password, newsletter } = parsed.value;
  const next = safeNext(String(form.get("next") ?? ""));
  if (!(await allowEmailLink())) return { status: "unavailable" };

  const db = await readerClient();
  if (!db) return { status: "unavailable" };
  const { data, error } = await db.auth.signUp({
    email,
    password,
    options: {
      data: { display_name: name },
      emailRedirectTo: callbackUrl({ fluxo: "cadastro", next }),
    },
  });
  if (error) {
    if (error.code === "user_already_exists" || error.code === "email_exists")
      return { status: "exists" };
    if (error.code === "weak_password") return { status: "invalid", fields: { password: true } };
    return { status: "unavailable" };
  }

  if (newsletter) {
    const nf = new FormData();
    nf.set("email", email);
    nf.set(LISTS_PICKED_FIELD, "1");
    nf.append("lists", NEWSLETTER_LIST);
    await subscribeNewsletter(nf, subscribeDeps(await headers()));
  }

  if (!data.session || !data.user) return { status: "check_email", email };
  await ensureProfile(db, data.user);
  redirect(afterLogin(next, "email"));
}
