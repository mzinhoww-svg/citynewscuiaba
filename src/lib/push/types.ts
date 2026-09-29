/**
 * Tipos do push (spec docs/superpowers/specs/2026-09-28-pwa-notificacoes-design.md §8.5, §11).
 * Só tipos e constantes: o cliente importa este módulo sem pesar o bundle.
 */
export type PushKind = "follow" | "urgent" | "highlight";
export const PUSH_KINDS: readonly PushKind[] = ["follow", "urgent", "highlight"];

/** Alvo explícito de uma inscrição (D-P12): nunca histórico, interesse nem `anonId`. */
export type TargetKey =
  `source:${string}` | `section:${string}` | `topic:${string}` | `bairro:${string}`;

export type Audience =
  | { type: "targets" }
  | { type: "all" }
  | { type: "section"; slug: string }
  | { type: "bairro"; slug: string };

export type BrowserFamily = "chrome" | "safari" | "firefox" | "edge" | "samsung" | "other";
export type DeviceClass = "mobile" | "tablet" | "desktop";
export type Platform = "android" | "ios" | "macos" | "windows" | "linux" | "other";

export type ReserveOutcome =
  "ok" | "skipped_pref" | "skipped_duplicate" | "skipped_quiet" | "skipped_limit" | "deferred";

/** Payload cifrado pelo `web-push` (spec §8.5): nada do leitor, nunca id de inscrição. */
export interface PushPayload {
  v: 1;
  /** Título ≤ 60. */
  t: string;
  /** Rótulo de origem · corpo (≤ 120 sem o prefixo). */
  b: string;
  /** Caminho interno (`/materia/<slug>`). */
  u: string;
  /** Tag do aviso (junta avisos da mesma matéria). */
  g: string;
  /** Id do envio (só para o recibo agregado). */
  s: string;
}

export type SendStatus =
  | "pending_approval"
  | "scheduled"
  | "queued"
  | "dispatching"
  | "sent"
  | "paused"
  | "cancelled"
  | "rejected"
  | "expired";
