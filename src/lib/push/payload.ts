/**
 * Payload e cabeçalhos do envio (spec §8.5, G19). Nada do leitor entra aqui.
 */
import { err, ok, type Result } from "@/lib/result";
import { BODY_MAX, sanitizeNotificationText, TITLE_MAX, withOriginLabel } from "./text";
import { TTL_HOURS } from "./rules";
import type { PushKind, PushPayload } from "./types";

export const PAYLOAD_MAX_BYTES = 1024;
const TOPIC_RE = /^[A-Za-z0-9_-]{1,32}$/;

/** Caminho interno: começa com `/`, nunca `//`, sem esquema, sem controle. */
export function internalUrl(u: string): boolean {
  return /^\/(?!\/)/.test(u) && !/[\u0000-\u001F\s]/.test(u) && !/^\/\\/.test(u);
}

export interface PayloadInput {
  title: string;
  body: string;
  originLabel: string;
  url: string;
  tag: string;
  sendId: string;
}

export function buildPayload(p: PayloadInput): Result<PushPayload, "bad_url" | "too_large"> {
  if (!internalUrl(p.url)) return err("bad_url");
  const payload: PushPayload = {
    v: 1,
    t: sanitizeNotificationText(p.title, TITLE_MAX),
    b: withOriginLabel(p.originLabel, sanitizeNotificationText(p.body, BODY_MAX)),
    u: p.url,
    g: p.tag,
    s: p.sendId,
  };
  if (new TextEncoder().encode(JSON.stringify(payload)).length > PAYLOAD_MAX_BYTES)
    return err("too_large");
  return ok(payload);
}

export interface PushHeaders {
  TTL: number;
  Urgency: "high" | "normal";
  Topic?: string;
}

/** TTL em segundos (6/2/12 h), `Urgency: high` só no urgente, `Topic` = tag válida. */
export function pushHeaders(kind: PushKind, tag: string): PushHeaders {
  const h: PushHeaders = {
    TTL: TTL_HOURS[kind] * 3600,
    Urgency: kind === "urgent" ? "high" : "normal",
  };
  if (TOPIC_RE.test(tag)) h.Topic = tag;
  return h;
}

/** Tag = id da matéria sem hífens (32 caracteres; G19). */
export function tagFor(articleId: string): string {
  return articleId.replace(/-/g, "").slice(0, 32);
}

/** Tag dos `follow` adiados e agrupados (D-P16). */
export const FOLLOW_TAG = "follow";
