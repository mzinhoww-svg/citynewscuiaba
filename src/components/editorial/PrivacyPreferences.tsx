"use client";

import { useState } from "react";
import { PRIVACY_PREFS_TEXT as T } from "@/content/pt-BR/privacy";
import { useConsent, useConsentKnown } from "@/lib/consent/client";
import type { ConsentChoice } from "@/lib/consent";
import { Button } from "../ui/Button";
import { ConsentChoices } from "./ConsentChoices";

/**
 * Preferências de privacidade em `/privacidade` (P22): as três categorias com a escolha atual
 * e "Salvar escolhas". Funciona sem conta; a escolha vale para este navegador.
 */
export function PrivacyPreferences() {
  const [consent, update] = useConsent();
  const known = useConsentKnown();
  const [draft, setDraft] = useState<ConsentChoice | null>(null);
  const [saved, setSaved] = useState(false);
  const value = draft ?? { metrics: consent.metrics, personalization: consent.personalization };

  return (
    <section
      id="preferencias"
      aria-labelledby="preferencias-titulo"
      className="flex max-w-read scroll-mt-8 flex-col gap-3 border-t border-line-subtle pt-6"
    >
      <h2 id="preferencias-titulo" className="type-section text-strong">
        {T.title}
      </h2>
      <p className="type-body text-body">{T.intro}</p>
      {known && (
        <p className="type-meta text-meta">
          {consent.decided ? T.current.decided : T.current.undecided}
        </p>
      )}
      <ConsentChoices
        value={value}
        onChange={(next) => {
          setDraft(next);
          setSaved(false);
        }}
      />
      <div className="flex flex-wrap items-center gap-4">
        <Button
          size="md"
          onClick={() => {
            update(value, "privacidade");
            setDraft(null);
            setSaved(true);
          }}
        >
          {T.save}
        </Button>
        <p role="status" className="type-meta text-service">
          {saved ? T.saved : ""}
        </p>
      </div>
    </section>
  );
}
