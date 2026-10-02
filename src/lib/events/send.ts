import { getAnonStore } from "@/lib/anon/store";
import { allowsSending, type Consent } from "@/lib/consent";
import type { EventName, EventProps } from "./names";
import { track } from "./track";

export type Extra = { sourceId?: string | null; contentId?: string | null };

/** Envia um evento com o consentimento dado (lê o `anonId` só com Personalização). */
export async function trackWithConsent<N extends EventName>(
  consent: Consent,
  name: N,
  props: EventProps[N],
  extra: Extra = {},
): Promise<boolean> {
  if (!allowsSending(consent)) return false;
  try {
    const anonId = consent.personalization ? await getAnonStore().ensureAnonId(consent) : null;
    return track(name, props, { consent, anonId, ...extra });
  } catch {
    return false;
  }
}
