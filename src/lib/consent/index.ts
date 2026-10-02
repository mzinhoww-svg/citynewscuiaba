/**
 * Consentimento granular (spec §5.2; tracking-plan §1). Três categorias:
 * - Necessários: sempre ativos (sessão, segurança e esta escolha).
 * - Métricas agregadas: contagens sem identificador persistente.
 * - Personalização: eventos individuais com `anonId`.
 *
 * A escolha fica no cookie first-party `cn_consent` = `v1|m0|p0` (versão da política,
 * métricas, personalização). Sem cookie, cookie malformado ou de outra versão da política:
 * vale "Só o necessário" e o banner volta a perguntar (`decided: false`).
 *
 * Módulo puro, sem React: servidor (layout lê o cookie) e cliente usam as mesmas regras.
 * O hook `useConsent` fica em `./client`.
 */

export const CONSENT_VERSION = "v1";
export const CONSENT_COOKIE = "cn_consent";
/** 12 meses: depois disso o banner pergunta de novo. */
export const CONSENT_MAX_AGE = 60 * 60 * 24 * 365;

export type Consent = {
  version: typeof CONSENT_VERSION;
  metrics: boolean;
  personalization: boolean;
  decided: boolean;
};

/** Escolhas que o leitor faz (a versão e o "decidido" vêm do próprio ato de escolher). */
export type ConsentChoice = Pick<Consent, "metrics" | "personalization">;

export const UNDECIDED: Consent = Object.freeze({
  version: CONSENT_VERSION,
  metrics: false,
  personalization: false,
  decided: false,
});

/** "Só o necessário". */
export const NECESSARY_ONLY: Consent = Object.freeze({
  version: CONSENT_VERSION,
  metrics: false,
  personalization: false,
  decided: true,
});

/** "Aceitar recomendações": métricas e personalização. */
export const ACCEPT_ALL: Consent = Object.freeze({
  version: CONSENT_VERSION,
  metrics: true,
  personalization: true,
  decided: true,
});

const PATTERN = /^v1\|m([01])\|p([01])$/;

function decode(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return "";
  }
}

export function parseConsent(cookie?: string | null): Consent {
  if (!cookie) return { ...UNDECIDED };
  const m = PATTERN.exec(decode(cookie.trim()));
  if (!m) return { ...UNDECIDED };
  return {
    version: CONSENT_VERSION,
    metrics: m[1] === "1",
    personalization: m[2] === "1",
    decided: true,
  };
}

export function serializeConsent(c: ConsentChoice & Partial<Consent>): string {
  return `${CONSENT_VERSION}|m${c.metrics ? 1 : 0}|p${c.personalization ? 1 : 0}`;
}

/** Consentimento decidido a partir de uma escolha. */
export function decide(choice: ConsentChoice): Consent {
  return {
    version: CONSENT_VERSION,
    metrics: choice.metrics,
    personalization: choice.personalization,
    decided: true,
  };
}

/** Linha para `document.cookie`: sem `Domain` (só este site), válida no site todo. */
export function consentCookie(c: ConsentChoice, opts: { secure: boolean }): string {
  return [
    `${CONSENT_COOKIE}=${serializeConsent(c)}`,
    "Path=/",
    `Max-Age=${CONSENT_MAX_AGE}`,
    "SameSite=Lax",
    ...(opts.secure ? ["Secure"] : []),
  ].join("; ");
}

/** Lê `cn_consent` de uma string no formato de `document.cookie`. */
export function readConsentCookie(cookieHeader: string): Consent {
  for (const part of cookieHeader.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === CONSENT_COOKIE) return parseConsent(part.slice(eq + 1));
  }
  return { ...UNDECIDED };
}

/** Há algo a enviar ao servidor? Sem métricas e sem personalização, nada sai do navegador. */
export function allowsSending(c: Consent): boolean {
  return c.decided && (c.metrics || c.personalization);
}
