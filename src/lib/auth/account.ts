import { z } from "zod";
import { err, ok, type Result } from "@/lib/result";
import { MIN_PASSWORD } from "./password";

/**
 * Regras puras da conta opcional (docs/screens.md C02 a C04). Sem banco e sem Supabase: as
 * Server Actions de `/entrar`, `/criar-conta` e `/redefinir-senha` usam estas funções.
 */

/** C02: bloqueio temporário de 15 min depois de 5 falhas. */
export const MAX_FAILURES = 5;
export const LOCK_MINUTES = 15;
const MIN_MS = 60_000;

export type LoginLock =
  { locked: false; remaining: number } | { locked: true; remaining: 0; retryAt: string };

/** Falhas dos últimos 15 minutos: quantas tentativas restam ou até quando está bloqueado. */
export function loginLock(failures: Date[], now: Date): LoginLock {
  const since = now.getTime() - LOCK_MINUTES * MIN_MS;
  const recent = failures.map((d) => d.getTime()).filter((t) => t > since && t <= now.getTime());
  if (recent.length < MAX_FAILURES)
    return { locked: false, remaining: MAX_FAILURES - recent.length };
  const last = Math.max(...recent);
  return {
    locked: true,
    remaining: 0,
    retryAt: new Date(last + LOCK_MINUTES * MIN_MS).toISOString(),
  };
}

export { MIN_PASSWORD, passwordStrength, type PasswordLevel } from "./password";

const email = z.string().trim().toLowerCase().pipe(z.email().max(254));

type Fields = Record<string, FormDataEntryValue | string | undefined | null>;
const text = (v: unknown) => (typeof v === "string" ? v : "");

export type FieldErrors<K extends string> = Partial<Record<K, true>>;

export function parseSignIn(
  f: Fields,
): Result<{ email: string; password: string }, FieldErrors<"email" | "password">> {
  const e = email.safeParse(text(f.email));
  const password = text(f.password);
  const errors: FieldErrors<"email" | "password"> = {};
  if (!e.success) errors.email = true;
  if (!password || password.length > 200) errors.password = true;
  return e.success && !errors.password ? ok({ email: e.data, password }) : err(errors);
}

export function parseEmail(v: unknown): string | null {
  const e = email.safeParse(text(v));
  return e.success ? e.data : null;
}

export interface SignUpInput {
  name: string;
  email: string;
  password: string;
  newsletter: boolean;
}

export function parseSignUp(
  f: Fields,
): Result<SignUpInput, FieldErrors<"name" | "email" | "password" | "terms">> {
  const name = text(f.name).trim().replace(/\s+/g, " ");
  const e = email.safeParse(text(f.email));
  const password = text(f.password);
  const errors: FieldErrors<"name" | "email" | "password" | "terms"> = {};
  if (!name || name.length > 80) errors.name = true;
  if (!e.success) errors.email = true;
  if (password.length < MIN_PASSWORD || password.length > 200) errors.password = true;
  if (text(f.terms) !== "on") errors.terms = true;
  if (Object.keys(errors).length > 0 || !e.success) return err(errors);
  return ok({ name, email: e.data, password, newsletter: text(f.newsletter) === "on" });
}

/** Nova senha e confirmação (C04, redefinir e alterar senha). */
export function parseNewPassword(f: Fields): Result<string, FieldErrors<"password" | "confirm">> {
  const password = text(f.password);
  const confirm = text(f.confirm);
  if (password.length < MIN_PASSWORD || password.length > 200) return err({ password: true });
  if (password !== confirm) return err({ confirm: true });
  return ok(password);
}

const AUTH_PAGES = [
  "/entrar",
  "/criar-conta",
  "/recuperar-senha",
  "/redefinir-senha",
  "/confirmar",
];

/**
 * Para onde voltar depois de entrar: só caminho interno (nunca `//host` nem URL absoluta) e
 * nunca de volta para as telas de conta. Padrão: `/perfil`.
 */
export function safeNext(next: string | null | undefined, fallback = "/perfil"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\"))
    return fallback;
  const path = next.split(/[?#]/)[0] ?? "";
  if (AUTH_PAGES.some((p) => path === p || path.startsWith(`${p}/`))) return fallback;
  return next;
}
