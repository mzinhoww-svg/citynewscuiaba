"use server";

import { headers } from "next/headers";
import { LIST_IDS, subscribeNewsletter, type NewsletterState } from "@/lib/newsletter/subscribe";
import { subscribeDeps } from "@/lib/newsletter/server";
import { verifyNewsletterToken } from "@/lib/newsletter/token";
import { setNewsletterPrefs } from "@/lib/db/writes";

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
  const v = verifyNewsletterToken(String(form.get("token") ?? ""));
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
