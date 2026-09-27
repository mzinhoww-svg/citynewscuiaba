"use server";

import { headers } from "next/headers";
import { hitRateLimit, saveNewsletterSubscription } from "@/lib/db/writes";
import { subscribeNewsletter, type NewsletterState } from "@/lib/newsletter/subscribe";
import { clientIp, ipKey, rateLimitSalt } from "@/lib/security/rate-limit";

/** Limite do formulário de newsletter: 5 envios por hora por conexão. */
const NEWSLETTER_LIMIT = 5;
const HOUR = 3600;

export async function subscribeNewsletterAction(
  _prev: NewsletterState,
  form: FormData,
): Promise<NewsletterState> {
  const key = ipKey(clientIp(await headers()), new Date(), rateLimitSalt());
  return subscribeNewsletter(form, {
    allow: () => hitRateLimit("newsletter", key, NEWSLETTER_LIMIT, HOUR),
    save: saveNewsletterSubscription,
  });
}
