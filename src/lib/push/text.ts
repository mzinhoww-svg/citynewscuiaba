/**
 * Texto do aviso (spec §14): sem HTML, sem controle, espaços normalizados, corte por grafema
 * com "…" dentro do máximo. O rótulo de origem (D-P18) vai na frente do corpo e não conta.
 */
export const TITLE_MAX = 60;
export const BODY_MAX = 120;
export const ELLIPSIS = "…";

const TAGS = /<[^>]*>/g;
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F​-‍⁠﻿]/g;

function graphemes(s: string): string[] {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const seg = new Intl.Segmenter("pt-BR", { granularity: "grapheme" });
    return [...seg.segment(s)].map((x) => x.segment);
  }
  return [...s];
}

export function sanitizeNotificationText(raw: string, max: number): string {
  const clean = String(raw ?? "")
    .replace(TAGS, " ")
    .replace(CONTROL, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
  const g = graphemes(clean);
  if (g.length <= max) return clean;
  return (
    g
      .slice(0, Math.max(0, max - 1))
      .join("")
      .trimEnd() + ELLIPSIS
  );
}

/** `"<RÓTULO> · <texto>"`: o prefixo fica fora dos 120 caracteres do corpo. */
export function withOriginLabel(label: string, body: string): string {
  const l = label.trim();
  return l ? `${l} · ${body}` : body;
}
