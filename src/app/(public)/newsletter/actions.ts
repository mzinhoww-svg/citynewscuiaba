"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { LIST_IDS, subscribeNewsletter, type NewsletterState } from "@/lib/newsletter/subscribe";
import { subscribeDeps } from "@/lib/newsletter/server";
import { verifyNewsletterToken } from "@/lib/newsletter/token";
import { confirmNewsletter, setNewsletterPrefs } from "@/lib/db/writes";

/** Inscrição na página /newsletter: listas escolhidas, confirmação dupla (P19). */
export async function subscribeListsAction(
  _prev: NewsletterState,
  form: FormData,
): Promise<NewsletterState> {
  return subscribeNewsletter(form, subscribeDeps(await headers()));
}

export type PrefsState = { status: "idle" | "saved" | "off" | "expired" | "invalid" | "error" };

/**
 * Centro de preferências pelo link assinado: salva as listas marcadas; "Sair de todas" desliga
 * tudo; "Voltar a receber" religa as listas do link. O token é a prova do e-mail.
 */
export async function savePrefsAction(_prev: PrefsState, form: FormData): Promise<PrefsState> {
  const v = verifyNewsletterToken(String(form.get("token") ?? ""), "newsletter");
  if (!v.ok) return { status: v.error };
  const intent = String(form.get("intent") ?? "save");
  const keep =
    intent === "off"
      ? []
      : intent === "resubscribe"
        ? v.value.lists.filter((l) => LIST_IDS.includes(l))
        : form
            .getAll("lists")
            .map(String)
            .filter((l) => LIST_IDS.includes(l));
  const r = await setNewsletterPrefs(v.value.email, keep, LIST_IDS);
  if (!r.ok) return { status: "error" };
  return { status: keep.length === 0 ? "off" : "saved" };
}

/**
 * Confirmação dupla (P19) só com o toque no botão: abrir o link não confirma, porque robôs de
 * e-mail abrem links (gate P2, I6; mesmo motivo de A-057). Volta para as preferências.
 */
export async function confirmNewsletterAction(form: FormData): Promise<void> {
  const token = String(form.get("token") ?? "");
  const v = verifyNewsletterToken(token, "newsletter");
  const base = `/newsletter/preferencias?token=${encodeURIComponent(token)}`;
  if (!v.ok) redirect(base);
  const r = await confirmNewsletter(v.value.email, v.value.lists);
  redirect(r.ok ? `${base}&confirmado=1` : `${base}&confirmar=1&erro=1`);
}
