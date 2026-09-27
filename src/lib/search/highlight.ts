import { fold } from "./query";

export interface Segment {
  text: string;
  mark: boolean;
}

/** A palavra do texto corresponde ao termo (sem acento, mesma raiz, nunca pedaço de palavra). */
function matches(word: string, term: string): boolean {
  if (term.length <= 4) return word === term || word === `${term}s` || word === `${term}es`;
  const prefix = term.slice(0, Math.max(4, term.length - 2));
  return word.startsWith(prefix) && word.length <= term.length + 4;
}

/**
 * Divide o texto em trechos marcados e não marcados para `<mark>` (P12). Trabalha só com texto:
 * quem renderiza é o React, que escapa tudo (sem `dangerouslySetInnerHTML`, sem XSS).
 */
export function highlightSegments(text: string, terms: string[]): Segment[] {
  if (!text) return [];
  if (terms.length === 0) return [{ text, mark: false }];
  const out: Segment[] = [];
  let cursor = 0;
  const push = (t: string, mark: boolean) => {
    if (!t) return;
    const last = out.at(-1);
    if (last && !last.mark && !mark) last.text += t;
    else out.push({ text: t, mark });
  };
  for (const m of text.matchAll(/[\p{L}\p{M}\p{N}]+/gu)) {
    const word = m[0];
    const start = m.index ?? 0;
    const folded = fold(word);
    if (!terms.some((t) => matches(folded, t))) continue;
    push(text.slice(cursor, start), false);
    push(word, true);
    cursor = start + word.length;
  }
  push(text.slice(cursor), false);
  return out;
}
