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
