"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { loginLock, parseEmail, parseSignIn, safeNext } from "@/lib/auth/account";
import type { EmailLinkState, SignInState } from "@/lib/auth/form-state";
import { googleEnabled, readerClient } from "@/lib/auth/reader";
import {
  clearLoginFailures,
  ensureProfile,
  loginFailureKey,
  readLoginFailures,
  recordLoginFailure,
} from "@/lib/db/account";
import { afterLogin, allowEmailLink, callbackUrl } from "@/lib/auth/links";
import { clientRateKey } from "@/lib/security/rate-limit";

/**
 * C02 · Entrar com e-mail e senha. Erro genérico ("E-mail ou senha incorretos") com as
 * tentativas que restam; 5 falhas em 15 minutos bloqueiam por 15 minutos (chave: e-mail e
 * conexão, com hash).
 */
export async function signInAction(_prev: SignInState, form: FormData): Promise<SignInState> {
  const parsed = parseSignIn({ email: form.get("email"), password: form.get("password") });
  if (!parsed.ok)
    return { status: "invalid", email: !!parsed.error.email, password: !!parsed.error.password };
  const { email, password } = parsed.value;
  const next = String(form.get("next") ?? "");

  const ipKey = clientRateKey(await headers(), new Date()) ?? "sem-sal";
  const key = loginFailureKey(email, ipKey);
  const now = new Date();
  const failures = await readLoginFailures(key, now);
  const before = loginLock(failures.ok ? failures.value : [], now);
  if (before.locked) return { status: "locked", retryAt: before.retryAt };

  const db = await readerClient();
  if (!db) return { status: "unavailable" };
  const { data, error } = await db.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    if (error?.code === "email_not_confirmed") return { status: "not_confirmed", email };
    if (error && error.status !== undefined && error.status >= 500)
      return { status: "unavailable" };
    await recordLoginFailure(key);
    const after = loginLock([...(failures.ok ? failures.value : []), new Date()], new Date());
    return after.locked
      ? { status: "locked", retryAt: after.retryAt }
      : { status: "wrong", remaining: after.remaining };
  }
  await clearLoginFailures(key);
  await ensureProfile(db, data.user);
  redirect(afterLogin(next, "email"));
}

/** C02 · Link mágico: mensagem neutra (não revela se o e-mail tem conta). */
export async function magicLinkAction(
  _prev: EmailLinkState,
  form: FormData,
): Promise<EmailLinkState> {
  const email = parseEmail(form.get("email"));
  if (!email) return { status: "invalid" };
  if (!(await allowEmailLink())) return { status: "rate_limited" };
  const db = await readerClient();
  if (!db) return { status: "unavailable" };
  const next = safeNext(String(form.get("next") ?? ""));
  const { error } = await db.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: callbackUrl({ next, metodo: "magic_link" }),
    },
  });
  // "Usuário não encontrado" e limites do Auth viram a mesma mensagem neutra.
  if (error && error.status !== undefined && error.status >= 500) return { status: "unavailable" };
  return { status: "sent", email };
}

/** C02 · Google (B-006): só com o provedor ligado; senão a tela mostra o botão desativado. */
export async function googleAction(form: FormData): Promise<void> {
  const next = safeNext(String(form.get("next") ?? ""));
  if (!googleEnabled()) redirect(`/entrar?${new URLSearchParams({ next, erro: "google" })}`);
  const db = await readerClient();
  if (!db) redirect(`/entrar?${new URLSearchParams({ next, erro: "servico" })}`);
  const { data, error } = await db.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: callbackUrl({ next, metodo: "google" }) },
  });
  if (error || !data.url) redirect(`/entrar?${new URLSearchParams({ next, erro: "google" })}`);
  redirect(data.url);
}
