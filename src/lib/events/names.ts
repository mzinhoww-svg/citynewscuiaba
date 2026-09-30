/**
 * Eventos do tracking-plan §2, sem zod (o cliente importa este módulo; o schema com zod fica
 * no servidor, `./schema`, para não pesar no bundle, A-045).
 */
export const EVENT_NAMES = [
  "source_viewed",
  "source_followed",
  "source_unfollowed",
  "article_opened",
  "article_read",
  "article_saved",
  "article_shared",
  "search_submitted",
  "recommendation_clicked",
  "recommendation_dismissed",
  "personalization_enabled",
  "personalization_disabled",
  "login_prompt_shown",
  "login_started",
  "login_completed",
  "login_skipped",
  "privacy_settings_updated",
  ...([
    "install_prompt_shown",
    "install_prompt_dismissed",
    "app_installed",
    "notif_preprompt_shown",
    "notif_preprompt_dismissed",
    "notif_permission_granted",
    "notif_permission_denied",
    "push_unsubscribed",
  ] as const),
] as const;

/** Eventos do app instalável e das notificações (spec 2026-09-28 §9.1); o servidor acrescenta `browser`. */
export const APP_EVENTS = [
  "install_prompt_shown",
  "install_prompt_dismissed",
  "app_installed",
  "notif_preprompt_shown",
  "notif_preprompt_dismissed",
  "notif_permission_granted",
  "notif_permission_denied",
  "push_unsubscribed",
] as const;
export const INSTALL_PLATFORMS = ["android", "ios", "desktop"] as const;
export const INSTALL_TRIGGERS = ["visits", "reads"] as const;
export const INSTALLED_VIA = ["prompt", "ios_steps", "browser", "unknown"] as const;
export const NOTIF_TRIGGERS = ["follow", "alert", "urgent_article", "settings"] as const;
export const NOTIF_PREPROMPT_TRIGGERS = ["follow", "alert", "urgent_article"] as const;

export type EventName = (typeof EVENT_NAMES)[number];

/** Versão do algoritmo de recomendação gravada em todo evento. */
export const ALGO_VERSION = "rec-v1";

/** Onde a ação aconteceu (`surface`). */
export const SURFACES = [
  "home",
  "fontes",
  "fonte",
  "panorama",
  "materia",
  "busca",
  "explorar",
  "assunto",
  "agenda",
  "favoritos",
  "perfil",
] as const;
export const ARTICLE_KINDS = ["original", "normalized", "aggregated"] as const;
export const SHARE_CHANNELS = [
  "native",
  "copy",
  "whatsapp",
  "telegram",
  "x",
  "facebook",
  "email",
] as const;
export const SEARCH_MODES = ["traditional", "ai"] as const;
export const REC_LISTS = [
  "popular",
  "trending",
  "recommended",
  "followed",
  "local",
  "verified",
  "new",
] as const;
export const DISMISS_REASONS = [
  "not_interested",
  "already_know",
  "hide_topic",
  "no_personalization",
] as const;
export const PERSONALIZATION_FROM = ["banner", "switch", "privacidade", "dismiss"] as const;
export const LOGIN_TRIGGERS = [
  "save",
  "follow",
  "alert",
  "collection",
  "sync",
  "topic",
  "ai",
] as const;
export const LOGIN_METHODS = ["email", "magic_link", "google"] as const;

type Of<T extends readonly string[]> = T[number];

/** Props de cada evento (tracking-plan §2). Nada além disto é aceito pelo servidor. */
export interface EventProps {
  source_viewed: { surface: Of<typeof SURFACES> };
  source_followed: { surface: Of<typeof SURFACES>; fromRecommendation: boolean };
  source_unfollowed: { surface: Of<typeof SURFACES> };
  article_opened: { kind: Of<typeof ARTICLE_KINDS>; position: number };
  article_read: { seconds: number; scrollPct: number };
  article_saved: { surface: Of<typeof SURFACES> };
  article_shared: { channel: Of<typeof SHARE_CHANNELS> };
  /** `query` só vai com Personalização (tracking-plan §2: sem o texto quando só métricas). */
  search_submitted: { mode: Of<typeof SEARCH_MODES>; resultCount: number; query?: string };
  recommendation_clicked: { list: Of<typeof REC_LISTS>; reason: string; position: number };
  recommendation_dismissed: {
    list: Of<typeof REC_LISTS>;
    reason: string;
    dismissReason: Of<typeof DISMISS_REASONS>;
  };
  personalization_enabled: { from: Of<typeof PERSONALIZATION_FROM> };
  personalization_disabled: { from: Of<typeof PERSONALIZATION_FROM> };
  login_prompt_shown: { trigger: Of<typeof LOGIN_TRIGGERS> };
  login_started: { trigger: Of<typeof LOGIN_TRIGGERS>; method: Of<typeof LOGIN_METHODS> };
  login_completed: { method: Of<typeof LOGIN_METHODS>; migrated: boolean };
  login_skipped: { trigger: Of<typeof LOGIN_TRIGGERS> };
  privacy_settings_updated: { metrics: boolean; personalization: boolean };
  install_prompt_shown: {
    platform: Of<typeof INSTALL_PLATFORMS>;
    trigger: Of<typeof INSTALL_TRIGGERS>;
  };
  install_prompt_dismissed: { platform: Of<typeof INSTALL_PLATFORMS>; refusals: 1 | 2 | 3 };
  app_installed: { via: Of<typeof INSTALLED_VIA> };
  notif_preprompt_shown: { trigger: Of<typeof NOTIF_PREPROMPT_TRIGGERS> };
  notif_preprompt_dismissed: { trigger: Of<typeof NOTIF_PREPROMPT_TRIGGERS>; refusals: 1 | 2 | 3 };
  notif_permission_granted: { trigger: Of<typeof NOTIF_TRIGGERS> };
  notif_permission_denied: { trigger: Of<typeof NOTIF_TRIGGERS> };
  push_unsubscribed: { from: "settings" };
}

/** Props de conteúdo pessoal: só saem com Personalização. */
export const PERSONAL_PROPS: readonly string[] = ["query"];

export type Device = "mobile" | "tablet" | "desktop";

/** Formato enviado a `/api/events` (tracking-plan §1). */
export interface EventPayload {
  name: EventName;
  anonId: string | null;
  userId: string | null;
  at: string;
  sourceId: string | null;
  contentId: string | null;
  session: { id: string; page: string; referrer: string | null; device: Device };
  consent: { version: string; metrics: boolean; personalization: boolean };
  algoVersion: string;
  props: Record<string, string | number | boolean>;
}
