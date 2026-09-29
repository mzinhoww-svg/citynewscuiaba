import {
  ADMIN_TEXT,
  ROLES_TEXT,
  TAXONOMY_TEXT,
  TEAMS_TEXT,
  USERS_TEXT,
} from "@/content/pt-BR/admin";
import type { StudioFail } from "@/lib/studio/action";

/*
 * Resultado das ações da Administração: o endereço leva só uma chave (`?ok=`/`?erro=`), nunca
 * texto livre, e a página resolve o texto numa lista fixa. Assim um link forjado não escreve
 * mensagem na tela.
 */
const ERRORS: Record<string, string> = {
  forbidden: ADMIN_TEXT.forbidden,
  invalid: ADMIN_TEXT.invalid,
  not_found: ADMIN_TEXT.notFound,
  conflict: ADMIN_TEXT.invalid,
  ...Object.fromEntries(
    [USERS_TEXT.errors, ROLES_TEXT.errors, TEAMS_TEXT.errors, TAXONOMY_TEXT.errors].flatMap((g) =>
      Object.values(g).map((text) => [`t:${text}`, text]),
    ),
  ),
};

/** Chave de erro para o endereço: a da mensagem conhecida, senão o código do erro. */
export function errorKey(fail: StudioFail): string {
  if (fail.message && `t:${fail.message}` in ERRORS) return `t:${fail.message}`;
  return fail.error;
}

export function errorText(key: string | string[] | undefined): string | null {
  return typeof key === "string" ? (ERRORS[key] ?? ADMIN_TEXT.invalid) : null;
}

export function okText(
  key: string | string[] | undefined,
  texts: Record<string, string>,
): string | null {
  return typeof key === "string" ? (texts[key] ?? null) : null;
}
