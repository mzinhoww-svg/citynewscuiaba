/**
 * Forma de comparação de texto: decompõe (NFD), tira os diacríticos (`\p{Diacritic}`) e passa
 * para minúsculas. Não apara nem troca espaços: quem precisa disso encadeia (`fold(s).trim()`).
 * "Cuiabá" → "cuiaba", "AÇÃO" → "acao".
 */
export function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}
