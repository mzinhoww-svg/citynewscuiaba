import type { FontMetrics } from "./font-metrics";

export interface FitOptions {
  /** Largura útil da caixa de texto, em px. */
  maxWidth: number;
  /** Linhas que cabem na caixa. */
  maxLines: number;
  /** Corpos permitidos, do maior para o menor; o último é o mínimo. */
  sizes: readonly number[];
}

export interface FitResult {
  size: number;
  lines: string[];
  /**
   * Nem no corpo mínimo coube: ficaram só as `maxLines` primeiras linhas, sem reticências. O
   * texto inteiro continua na legenda do post.
   */
  clamped: boolean;
}

/** Quebra palavra por palavra; palavra maior que a linha é partida por caractere. */
export function wrapText(text: string, size: number, maxWidth: number, m: FontMetrics): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  const push = (word: string) => {
    if (m.measure(word, size) <= maxWidth) return word;
    // Palavra longa demais: vai em pedaços que cabem na linha.
    let part = "";
    for (const ch of word) {
      if (part && m.measure(part + ch, size) > maxWidth) {
        lines.push(part);
        part = ch;
      } else part += ch;
    }
    return part;
  };
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (m.measure(next, size) <= maxWidth) {
      line = next;
      continue;
    }
    if (line) lines.push(line);
    line = push(word);
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Maior corpo em que o texto cabe em `maxLines` linhas, descendo um degrau de cada vez. Nunca
 * corta com reticências; se nem o mínimo couber, devolve as primeiras linhas e `clamped`.
 */
export function fitText(text: string, m: FontMetrics, opts: FitOptions): FitResult {
  const sizes = opts.sizes.length ? opts.sizes : [16];
  for (const size of sizes) {
    const lines = wrapText(text, size, opts.maxWidth, m);
    if (lines.length <= opts.maxLines) return { size, lines, clamped: false };
  }
  const size = sizes[sizes.length - 1] ?? 16;
  const lines = wrapText(text, size, opts.maxWidth, m);
  return { size, lines: lines.slice(0, opts.maxLines), clamped: true };
}
