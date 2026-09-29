/**
 * Travas de segurança das regras de autonomia (CLAUDE.md regra 8): Segurança e notícia urgente
 * nunca publicam sozinhas, qualquer que seja a versão das regras. Funções puras usadas pelo
 * pipeline (`routeArticle`), pela simulação e pela validação de propostas no Control Center;
 * o banco confere a mesma lista (`rules_body_safe`, migration 0028).
 */

/** Categorias que nunca publicam sozinhas; na regra só aceitam `blocked` ou `review`. */
export const NEVER_AUTO_CATEGORIES: ReadonlySet<string> = new Set([
  "seguranca",
  "urgente",
  "breaking",
  "breaking-news",
  "ultima-hora",
  "plantao",
]);

/** Minúsculas, sem acento; espaço e sublinhado viram hífen. */
export const foldKey = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-");

export function isNeverAutoCategory(category: string): boolean {
  return NEVER_AUTO_CATEGORIES.has(foldKey(category));
}
