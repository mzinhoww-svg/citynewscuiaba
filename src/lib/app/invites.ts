/**
 * Convites de instalação (C07) e de notificações (C09), regras puras (spec 2026-09-28 §7.1,
 * §7.2, §7.4, D-P04, D-P05). Estado em `localStorage` `cn_app` (storage.ts), nunca enviado.
 */
export interface AppState {
  visits: number;
  reads: number;
  install: {
    refusals: number;
    silencedUntil: string | null;
    installed: boolean;
    /** O leitor já viu os passos do iPhone (C08): a 1ª abertura instalada conta como `ios_steps`. */
    stepsShown?: boolean;
  };
  notif: { refusals: number; silencedUntil: string | null };
  lastVisitDay: string | null;
  lastVisitAt: string | null;
}

export const EMPTY_APP_STATE: AppState = {
  visits: 0,
  reads: 0,
  install: { refusals: 0, silencedUntil: null, installed: false },
  notif: { refusals: 0, silencedUntil: null },
  lastVisitDay: null,
  lastVisitAt: null,
};

export const SILENCE_DAYS = 14;
export const MAX_REFUSALS = 3;
export const MIN_VISITS = 2;
export const MIN_READS = 3;
export const VISIT_GAP_MS = 30 * 60_000;
export const BLOCKED_PATHS = [
  "/estudio",
  "/entrar",
  "/criar-conta",
  "/perfil",
  "/privacidade",
] as const;

const day = (d: Date) => d.toISOString().slice(0, 10);

export function isBlockedPath(path: string): boolean {
  return BLOCKED_PATHS.some((p) => path === p || path.startsWith(`${p}/`));
}

/** Visita = 1ª navegação de uma sessão de aba; a 2ª visita é em outro dia ou ≥ 30 min depois. */
export function recordVisit(s: AppState, now: Date, newTabSession: boolean): AppState {
  const today = day(now);
  const gap = s.lastVisitAt ? now.getTime() - Date.parse(s.lastVisitAt) : Infinity;
  const counts =
    s.visits === 0 || (newTabSession && (s.lastVisitDay !== today || gap >= VISIT_GAP_MS));
  return {
    ...s,
    visits: counts ? s.visits + 1 : s.visits,
    lastVisitDay: today,
    lastVisitAt: now.toISOString(),
  };
}

export function recordRead(s: AppState): AppState {
  return { ...s, reads: s.reads + 1 };
}

export interface InstallContext {
  standalone: boolean;
  canPrompt: boolean;
  ios: boolean;
  iosSafari: boolean;
  path: string;
}

function silenced(until: string | null, now: Date): boolean {
  return until !== null && Date.parse(until) > now.getTime();
}

/** Faixa de instalação: 2ª visita ou 3 leituras, com como instalar, sem app e sem recusa recente. */
export function shouldOfferInstall(
  s: AppState,
  ctx: InstallContext,
  now: Date,
): false | "visits" | "reads" {
  if (ctx.standalone || s.install.installed) return false;
  if (isBlockedPath(ctx.path)) return false;
  if (s.install.refusals >= MAX_REFUSALS) return false;
  if (silenced(s.install.silencedUntil, now)) return false;
  if (!(ctx.canPrompt || (ctx.ios && ctx.iosSafari))) return false;
  if (s.visits >= MIN_VISITS) return "visits";
  if (s.reads >= MIN_READS) return "reads";
  return false;
}

export interface NotifContext {
  pushAvailable: boolean;
  permission: NotificationPermission;
  subscribed: boolean;
  ios: boolean;
  standalone: boolean;
  path: string;
}

/** Pré-prompt de notificações: só por gatilho, com push disponível e permissão ainda não decidida. */
export function shouldOfferNotifications(s: AppState, ctx: NotifContext, now: Date): boolean {
  if (!ctx.pushAvailable || ctx.permission !== "default" || ctx.subscribed) return false;
  if (ctx.ios && !ctx.standalone) return false;
  if (isBlockedPath(ctx.path)) return false;
  if (s.notif.refusals >= MAX_REFUSALS) return false;
  if (silenced(s.notif.silencedUntil, now)) return false;
  return true;
}

/** "Agora não": +1 recusa e silêncio de 14 dias; na 3ª, nunca mais. */
export function recordRefusal(s: AppState, which: "install" | "notif", now: Date): AppState {
  const until = new Date(now.getTime() + SILENCE_DAYS * 86_400_000).toISOString();
  if (which === "install")
    return {
      ...s,
      install: { ...s.install, refusals: s.install.refusals + 1, silencedUntil: until },
    };
  return { ...s, notif: { refusals: s.notif.refusals + 1, silencedUntil: until } };
}

export function markInstalled(s: AppState): AppState {
  return { ...s, install: { ...s.install, installed: true } };
}

export function markStepsShown(s: AppState): AppState {
  return { ...s, install: { ...s.install, stepsShown: true } };
}
