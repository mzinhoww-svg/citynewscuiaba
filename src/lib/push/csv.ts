/**
 * Célula de CSV do histórico (PWA-13): aspas quando há separador, e prefixo `'` quando o texto
 * (título de matéria ou de aviso, derivado de fonte externa) começaria uma fórmula no Excel.
 */
const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(v: string | number | null): string {
  let s = v === null ? "" : String(v);
  if (typeof v === "string" && FORMULA_START.test(s)) s = `'${s}`;
  return /[",;\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Lê `limit` linhas em páginas por posição (`range`), mais uma para saber se havia mais. O
 * PostgREST corta cada resposta em `max_rows` (1000 no config.toml): um `.limit(5000)` sozinho
 * entregaria 1000 sem avisar (mesmo problema da auditoria, gate P5 achado 11). A ordem da
 * consulta precisa ser total (com desempate por `id`) para as páginas não repetirem linha.
 */
export async function collectRange<T>(
  fetchRange: (from: number, to: number) => Promise<T[]>,
  limit: number,
  pageSize = 1000,
): Promise<{ rows: T[]; truncated: boolean }> {
  const all: T[] = [];
  while (all.length < limit + 1) {
    const want = Math.min(pageSize, limit + 1 - all.length);
    const page = await fetchRange(all.length, all.length + want - 1);
    if (page.length === 0) break;
    all.push(...page);
  }
  const truncated = all.length > limit;
  return { rows: truncated ? all.slice(0, limit) : all, truncated };
}
