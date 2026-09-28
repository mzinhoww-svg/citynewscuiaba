/**
 * Há sessão do Supabase Auth neste navegador? Olha só o nome do cookie (`sb-<ref>-auth-token`,
 * inteiro ou em pedaços `.0`, `.1`), sem validar: serve para esconder convites de quem já
 * entrou, nunca para autorizar nada (quem autoriza é o servidor com `getUser`).
 */
const AUTH_COOKIE = /(?:^|;\s*)sb-[^=;]+-auth-token(?:\.\d+)?=[^;]+/;

export function hasAuthCookie(cookie: string): boolean {
  return AUTH_COOKIE.test(cookie);
}
