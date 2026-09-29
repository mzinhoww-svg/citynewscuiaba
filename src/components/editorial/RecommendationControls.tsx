"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { ANON_TEXT, RECS_PAGE_TEXT as T } from "@/content/pt-BR/privacy";
import { useAnonProfile } from "@/lib/anon/use-profile";
import { clearOffline } from "@/lib/offline/sw";
import { useConsent, useConsentKnown } from "@/lib/consent/client";
import { Button } from "../ui/Button";
import { InlineAlert } from "../ui/InlineAlert";
import { Skeleton } from "../ui/Skeleton";
import { Toggle } from "../ui/Toggle";

function Block({ title, children, id }: { title: string; children: React.ReactNode; id: string }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3 border-t border-line-subtle pt-6">
      <h2 id={id} className="type-section text-strong">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Row({
  label,
  help,
  children,
}: {
  label: string;
  help: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line-subtle py-3 last:border-b-0">
      <div className="flex min-w-0 flex-col gap-1">
        <span className="type-label text-strong">{label}</span>
        <span className="type-meta text-meta">{help}</span>
      </div>
      {children}
    </div>
  );
}

/**
 * Como usamos suas recomendações (P21): as escolhas de consentimento com o interruptor
 * "Recomendações pelo que você lê", o perfil deste navegador, os interesses considerados (com
 * evidência, sinal fraco e Remover) e os controles Apagar histórico local, Redefinir e
 * Desativar. Tudo vale sem conta, neste navegador.
 */
export function RecommendationControls() {
  const [consent, update] = useConsent();
  const known = useConsentKnown();
  const { profile, degraded, ready, act } = useAnonProfile();
  const [status, setStatus] = useState("");
  const id = useId();

  if (!known || !ready || !profile) {
    return (
      <div aria-busy="true" className="flex flex-col gap-3">
        <p className="type-meta text-meta">{T.loading}</p>
        <Skeleton lines={4} />
      </div>
    );
  }

  const on = consent.personalization;
  const setPersonalization = (next: boolean) => {
    update({ personalization: next }, "privacidade");
    setStatus(next ? "" : T.disabled);
  };

  return (
    <div data-ready="true" className="flex flex-col gap-8">
      {degraded && (
        <InlineAlert tone="warn" title={ANON_TEXT.degraded} role="none">
          <p>{ANON_TEXT.degradedDetail}</p>
        </InlineAlert>
      )}

      <Block title={T.choices} id={`${id}-escolhas`}>
        <div className="flex flex-col">
          <Row label={T.switchLabel} help={T.switchHelp}>
            <Toggle label={T.switchLabel} checked={on} onChange={setPersonalization} />
          </Row>
          <Row label={T.metricsLabel} help={T.metricsHelp}>
            <Toggle
              label={T.metricsLabel}
              checked={consent.metrics}
              onChange={(metrics) => update({ metrics }, "privacidade")}
            />
          </Row>
        </div>
        <p className="type-meta text-meta">{T.necessary}</p>
      </Block>

      <Block title={T.browser} id={`${id}-navegador`}>
        <p className="type-body text-body">
          {on ? T.browserCounts(profile.history.length, profile.searches.length) : T.browserOff}
        </p>
      </Block>

      <Block title={T.interests} id={`${id}-interesses`}>
        <p className="type-meta text-meta">{T.interestsIntro}</p>
        {profile.interests.length === 0 ? (
          <p className="type-body text-body">{T.interestsEmpty}</p>
        ) : (
          <ul className="flex flex-col">
            {profile.interests.map((i) => (
              <li
                key={i.key}
                className="flex items-center justify-between gap-4 border-b border-line-subtle py-3 last:border-b-0"
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="type-label text-strong">{i.key}</span>
                  <span className="type-meta text-meta">
                    {i.evidence}
                    {i.weak && ` · ${T.weak}`}
                  </span>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  aria-label={T.remove(i.key)}
                  onClick={() => {
                    void act((s) => s.removeInterest(i.key)).then(() => setStatus(T.removed));
                  }}
                >
                  {T.removeText}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Block>

      <Block title={T.actions} id={`${id}-controles`}>
        <div className="flex flex-col items-start gap-4">
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              // Apagar histórico local também limpa as cópias offline de lidas e páginas (§8.3).
              void Promise.all([act((s) => s.clearHistory()), clearOffline()]).then(() =>
                setStatus(T.cleared),
              )
            }
          >
            {T.clear}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              void act((s) => s.resetRecommendations()).then(() => setStatus(T.resetDone))
            }
          >
            {T.reset}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!on}
            onClick={() => setPersonalization(false)}
          >
            {T.disable}
          </Button>
        </div>
        <p role="status" className="type-meta text-service">
          {status}
        </p>
      </Block>

      <Block title={T.notifications} id={`${id}-notificacoes`}>
        <p className="type-body text-body">{T.notificationsText}</p>
        <p>
          <Link href="/alertas" className="font-semibold text-link underline underline-offset-4">
            {T.notificationsLink}
          </Link>
        </p>
      </Block>

      <Block title={T.policy} id={`${id}-politica`}>
        <p className="type-body text-body">{T.policyText}</p>
        <p>
          <Link
            href="/privacidade"
            className="font-semibold text-link underline underline-offset-4"
          >
            {T.policyLink}
          </Link>
        </p>
      </Block>
    </div>
  );
}
