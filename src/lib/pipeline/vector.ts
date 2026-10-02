/** Cosseno entre dois vetores. `NaN` quando as dimensões diferem ou um deles é nulo. */
export function cosine(a: readonly number[], b: readonly number[]): number {
  if (a.length === 0 || a.length !== b.length) return Number.NaN;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!;
    const y = b[i]!;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (na === 0 || nb === 0) return Number.NaN;
  return dot / Math.sqrt(na * nb);
}

/** Literal do pgvector (`[1,2,3]`). */
export const vectorLiteral = (v: readonly number[]): string => `[${v.join(",")}]`;
