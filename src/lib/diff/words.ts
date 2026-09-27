/**
 * Diferença por palavra entre duas versões (histórico público, P04). LCS simples sobre tokens
 * (palavras e espaços); trechos vizinhos do mesmo tipo são unidos.
 */
export type DiffPart = { type: "same" | "add" | "del"; text: string };

const MAX_TOKENS = 4000;

function tokens(s: string): string[] {
  return s.match(/\s+|[^\s]+/g) ?? [];
}

function push(out: DiffPart[], type: DiffPart["type"], text: string) {
  if (!text) return;
  const last = out[out.length - 1];
  if (last && last.type === type) last.text += text;
  else out.push({ type, text });
}

export function diffWords(before: string, after: string): DiffPart[] {
  const a = tokens(before);
  const b = tokens(after);
  if (a.length * b.length > MAX_TOKENS * MAX_TOKENS) {
    const out: DiffPart[] = [];
    push(out, "del", before);
    push(out, "add", after);
    return out;
  }
  // lcs[i][j] = tamanho da maior subsequência comum de a[i:] e b[j:]
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i]![j] =
        a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }
  const out: DiffPart[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      push(out, "same", a[i]!);
      i++;
      j++;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      push(out, "del", a[i++]!);
    } else {
      push(out, "add", b[j++]!);
    }
  }
  while (i < a.length) push(out, "del", a[i++]!);
  while (j < b.length) push(out, "add", b[j++]!);
  return out;
}
