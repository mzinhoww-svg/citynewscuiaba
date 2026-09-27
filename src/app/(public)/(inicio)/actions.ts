"use server";

import { headers } from "next/headers";
import { hitRateLimit, saveNewsletterSubscription } from "@/lib/db/writes";
import { subscribeNewsletter, type NewsletterState } from "@/lib/newsletter/subscribe";
import { ok } from "@/lib/result";
import { clientRateKey } from "@/lib/security/rate-limit";

/** Limite do formulário de newsletter: 5 envios por hora por conexão. */
const NEWSLETTER_LIMIT = 5;
const HOUR = 3600;

export async function subscribeNewsletterAction(
  _prev: NewsletterState,
  form: FormData,
): Promise<NewsletterState> {
  const key = clientRateKey(await headers(), new Date());
  return subscribeNewsletter(form, {
    allow: () =>
      key === null
        ? Promise.resolve(ok(false))
        : hitRateLimit("newsletter", key, NEWSLETTER_LIMIT, HOUR),
    save: saveNewsletterSubscription,
  });
}
