/** Célula CSV: aspas duplicadas e prefixo contra fórmula de planilha (`=`, `+`, `-`, `@`). */
export function csvCell(v: unknown): string {
  let s = v === null || v === undefined ? "" : typeof v === "string" ? v : JSON.stringify(v);
  s = s.replace(/[\r\n]+/g, " ");
  if (/^[=+\-@\t]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export const EXPORT_LIMIT = 5000;
