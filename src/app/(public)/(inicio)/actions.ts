"use server";

import { headers } from "next/headers";
import { subscribeNewsletter, type NewsletterState } from "@/lib/newsletter/subscribe";
import { subscribeDeps } from "@/lib/newsletter/server";

/** Newsletter da home: só e-mail, lista diária, confirmação dupla (P19). */
export async function subscribeNewsletterAction(
  _prev: NewsletterState,
  form: FormData,
): Promise<NewsletterState> {
  return subscribeNewsletter(form, subscribeDeps(await headers()));
}
