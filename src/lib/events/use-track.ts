"use client";

import { useCallback, useEffect, useRef } from "react";
import { useConsent } from "@/lib/consent/client";
import type { EventName, EventProps } from "./names";
import { trackWithConsent, type Extra } from "./send";

/**
 * `track` ligado ao consentimento atual do leitor. Nunca lança e nunca envia sem permissão.
 *
 * ```tsx
 * const send = useTrack();
 * send("article_saved", { surface: "materia" }, { contentId: "article:1" });
 * ```
 */
export function useTrack() {
  const [consent] = useConsent();
  const current = useRef(consent);
  useEffect(() => {
    current.current = consent;
  }, [consent]);
  return useCallback(
    <N extends EventName>(name: N, props: EventProps[N], extra?: Extra) =>
      trackWithConsent(current.current, name, props, extra),
    [],
  );
}
