"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { ReactNode } from "react";
import {
  UNDECIDED,
  consentCookie,
  decide,
  readConsentCookie,
  type Consent,
  type ConsentChoice,
} from "./index";

/** De onde veio a mudança (evento `personalization_enabled`/`_disabled`, tracking-plan §2). */
export type ConsentSource = "banner" | "switch" | "privacidade" | "dismiss";

type Ctx = {
  /** `null` enquanto o cookie não foi lido (sem provedor com valor inicial do servidor). */
  consent: Consent | null;
  update: (next: Partial<ConsentChoice>, from?: ConsentSource) => void;
};

const ConsentContext = createContext<Ctx | null>(null);

/** O cookie só muda por `update` (que já guarda o valor novo): não há o que assinar. */
function subscribeNever() {
  return () => {};
}

function readDocumentCookie(): string {
  try {
    return document.cookie;
  } catch {
    return "";
  }
}

/** No servidor e na hidratação a escolha é desconhecida (sem valor inicial). */
function serverSnapshot(): string | null {
  return null;
}

function writeCookie(c: ConsentChoice) {
  try {
    document.cookie = consentCookie(c, { secure: location.protocol === "https:" });
  } catch {
    // Cookie bloqueado: a escolha vale só nesta página (continua sem enviar nada).
  }
}

export interface ConsentProviderProps {
  /** Valor lido do cookie no servidor (evita o banner piscar para quem já escolheu). */
  initial?: Consent;
  children: ReactNode;
}

/**
 * Guarda a escolha de privacidade do leitor. Toda mudança grava o cookie `cn_consent`
 * (necessário) e vale na hora para os componentes que usam `useConsent`.
 */
export function ConsentProvider({ initial, children }: ConsentProviderProps) {
  const cookie = useSyncExternalStore(subscribeNever, readDocumentCookie, serverSnapshot);
  const [chosen, setChosen] = useState<Consent | null>(null);
  const consent = chosen ?? initial ?? (cookie === null ? null : readConsentCookie(cookie));

  const current = useRef(consent);
  useEffect(() => {
    current.current = consent;
  }, [consent]);

  const update = useCallback((next: Partial<ConsentChoice>) => {
    const base = current.current ?? UNDECIDED;
    const decided = decide({
      metrics: next.metrics ?? base.metrics,
      personalization: next.personalization ?? base.personalization,
    });
    current.current = decided;
    writeCookie(decided);
    setChosen(decided);
  }, []);

  const value = useMemo(() => ({ consent, update }), [consent, update]);
  return <ConsentContext.Provider value={value}>{children}</ConsentContext.Provider>;
}

/**
 * `[consent, update]`. Sem provedor ou antes de ler o cookie, `consent` é "Só o necessário"
 * não decidido (nada é enviado). `update` marca como decidido e grava o cookie.
 */
export function useConsent(): [Consent, Ctx["update"]] {
  const ctx = useContext(ConsentContext);
  return [ctx?.consent ?? UNDECIDED, ctx?.update ?? noop];
}

/** `true` depois que a escolha foi lida (do servidor ou do cookie no navegador). */
export function useConsentKnown(): boolean {
  return useContext(ConsentContext)?.consent != null;
}

function noop() {}
