/**
 * Conferência leve de formato de e-mail para o navegador, sem `zod` (B-018: nenhum componente
 * cliente público alcança pacote pesado). Só antecipa o erro no campo; a validação que vale é a do
 * servidor (`parseEmail` em `account.ts`).
 */
const SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function looksLikeEmail(v: string): boolean {
  const s = v.trim();
  return s.length <= 254 && SHAPE.test(s);
}
