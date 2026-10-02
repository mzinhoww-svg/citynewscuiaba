import type { InviteTrigger } from "./invite";

export type { InviteTrigger } from "./invite";

/**
 * Regras dos convites (spec §5.4, docs/screens.md C01 e P23). Puras: quem guarda o histórico
 * (localStorage) e conta as leituras da sessão (sessionStorage) é o componente.
 */
export const INVITE_WINDOW_DAYS = 7;
export const FIRST_VISIT_READS = 3;
const DAY_MS = 86_400_000;

export const INVITE_TRIGGERS: readonly InviteTrigger[] = [
  "save",
  "follow",
  "alert",
  "collection",
  "sync",
  "topic",
  "ai",
];

export interface InviteShown {
  trigger: InviteTrigger;
  at: string;
}

/** No máximo 1 convite por gatilho a cada 7 dias. */
export function shouldShowInvite(
  trigger: InviteTrigger,
  history: InviteShown[],
  now: Date,
): boolean {
  const limit = now.getTime() - INVITE_WINDOW_DAYS * DAY_MS;
  return !history.some((h) => h.trigger === trigger && Date.parse(h.at) > limit);
}

/** Registra o convite exibido: um por gatilho, sem os que já passaram da janela. */
export function recordInvite(
  history: InviteShown[],
  trigger: InviteTrigger,
  now: Date,
): InviteShown[] {
  const limit = now.getTime() - INVITE_WINDOW_DAYS * DAY_MS;
  return [
    ...history.filter((h) => h.trigger !== trigger && Date.parse(h.at) > limit),
    { trigger, at: now.toISOString() },
  ];
}

/** Lê o histórico guardado no navegador; o que não for válido é descartado. */
export function parseInviteHistory(raw: string | null): InviteShown[] {
  if (!raw) return [];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  return data.flatMap((x): InviteShown[] => {
    if (typeof x !== "object" || x === null) return [];
    const { trigger, at } = x as { trigger?: unknown; at?: unknown };
    const t = INVITE_TRIGGERS.find((k) => k === trigger);
    return t && typeof at === "string" && !Number.isNaN(Date.parse(at)) ? [{ trigger: t, at }] : [];
  });
}

/** Painel da primeira visita: depois de 3 leituras qualificadas na sessão, até o leitor decidir. */
export function shouldShowFirstVisit(qualifiedReadsThisSession: number, decided: boolean): boolean {
  return !decided && qualifiedReadsThisSession >= FIRST_VISIT_READS;
}

export interface OnboardingCandidate {
  slug: string;
  name: string;
  locality: string;
  categories: string[];
  score: number;
}

export type OnboardingGroup = "local" | "state" | "theme";
export type OnboardingSource = OnboardingCandidate & { group: OnboardingGroup };

const LOCAL = new Set(["cuiaba", "varzea-grande"]);
const QUOTA: Record<OnboardingGroup, number> = { local: 6, state: 3, theme: 3 };

/**
 * Seletor da primeira visita (P23): 12 fontes, 6 locais (Cuiabá e Várzea Grande), 3 estaduais
 * e 3 temáticas (as de editoria mais bem colocadas entre as que sobraram). Faltando fontes num
 * grupo, completa com as demais, sem repetir.
 */
export function pickOnboardingSources(all: OnboardingCandidate[]): OnboardingSource[] {
  const sorted = [...all].sort((a, b) => b.score - a.score || a.slug.localeCompare(b.slug));
  const used = new Set<string>();
  const take = (group: OnboardingGroup, pred: (s: OnboardingCandidate) => boolean) => {
    const out: OnboardingSource[] = [];
    for (const s of sorted) {
      if (out.length >= QUOTA[group]) break;
      if (used.has(s.slug) || !pred(s)) continue;
      used.add(s.slug);
      out.push({ ...s, group });
    }
    return out;
  };
  const local = take("local", (s) => LOCAL.has(s.locality));
  const state = take("state", (s) => s.locality === "mt");
  const theme = take("theme", (s) => s.categories.length > 0);
  const picked = [...local, ...state, ...theme];
  const total = QUOTA.local + QUOTA.state + QUOTA.theme;
  for (const s of sorted) {
    if (picked.length >= total) break;
    if (used.has(s.slug)) continue;
    used.add(s.slug);
    picked.push({
      ...s,
      group: LOCAL.has(s.locality) ? "local" : s.locality === "mt" ? "state" : "theme",
    });
  }
  return picked;
}
