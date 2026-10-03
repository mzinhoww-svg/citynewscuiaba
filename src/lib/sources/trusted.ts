import type { Reliability } from "./types";

/**
 * Fonte confiável (A6/A7): a coluna `sources.trusted` decide; sem ela (dado antigo) vale o padrão
 * do backfill, `reliability` em `primary` ou `verified`.
 */
export function sourceTrusted(s: {
  trusted?: boolean | null;
  reliability: Reliability | string;
}): boolean {
  if (typeof s.trusted === "boolean") return s.trusted;
  return s.reliability === "primary" || s.reliability === "verified";
}

/** Algum item do assunto vem de fonte confiável? */
export function anySourceTrusted(
  items: readonly { trusted?: boolean | null; reliability: Reliability | string }[],
): boolean {
  return items.some(sourceTrusted);
}
