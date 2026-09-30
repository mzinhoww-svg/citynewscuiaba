/**
 * Login do Estúdio nos testes e2e (painel de fontes, FS-T7/FS-T8/FS-T9): entra com uma pessoa do
 * seed pela API de Auth da pilha local e grava os cookies de sessão do `@supabase/ssr` no contexto
 * do Playwright, sem depender da tela /entrar. Só pessoas fictícias do seed (senha local).
 *
 * ```ts
 * await loginAs(page.context(), "diego");
 * await page.goto("/estudio/control/fontes");
 * ```
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { BrowserContext } from "@playwright/test";
import { createServerClient } from "@supabase/ssr";

export const STAFF = {
  helena: "helena.costa@citynews.local", // admin
  marina: "marina.arruda@citynews.local", // editor_chefe
  otavio: "otavio.reis@citynews.local", // editor
  juliana: "juliana.campos@citynews.local", // jornalista
  beatriz: "beatriz.lemos@citynews.local", // revisor
  carlos: "carlos.nunes@citynews.local", // moderador
  diego: "diego.prado@citynews.local", // operador_ia
  thiago: "thiago.moraes@citynews.local", // analista (sem source.manage)
  paulo: "paulo.rezende@citynews.local", // leitura
} as const;
export type StaffKey = keyof typeof STAFF;

/** Senha local do seed (supabase/seed.sql); nunca vale fora da pilha de desenvolvimento. */
const SEED_PASSWORD = "citynews-local-123";

function supabaseEnv(): { url: string; anonKey: string } {
  // Playwright não carrega `.env.local` (escrito por scripts/local-stack/start.sh): lê as duas
  // variáveis públicas de lá quando o ambiente não as trouxe (CI define direto).
  const file = join(process.cwd(), ".env.local");
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL && existsSync(file)) {
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const m = /^\s*(NEXT_PUBLIC_SUPABASE_(?:URL|ANON_KEY))\s*=\s*"?([^"\n]*)"?\s*$/.exec(line);
      if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2];
    }
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error("NEXT_PUBLIC_SUPABASE_URL/ANON_KEY ausentes (.env.local)");
  return { url, anonKey };
}

/**
 * Cookies de sessão exatamente como o `@supabase/ssr` do app grava (nome, fatias e codificação),
 * para o `createServerClient` do servidor ler a sessão na primeira requisição.
 */
export async function sessionCookies(who: StaffKey): Promise<{ name: string; value: string }[]> {
  return sessionCookiesFor(STAFF[who], SEED_PASSWORD);
}

/** Igual a `sessionCookies`, para qualquer conta local (por exemplo, leitor criado no teste). */
export async function sessionCookiesFor(
  email: string,
  password: string,
): Promise<{ name: string; value: string }[]> {
  const { url, anonKey } = supabaseEnv();
  const jar = new Map<string, string>();
  const client = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (toSet) => {
        for (const { name, value } of toSet) {
          if (value) jar.set(name, value);
          else jar.delete(name);
        }
      },
    },
  });
  const { error } = await client.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw new Error(`login de ${email} falhou: ${error.message}`);
  return [...jar].map(([name, value]) => ({ name, value }));
}

/** Mesmo `baseURL` do playwright.config.ts (porta 3000 + `.local/offset` do worktree). */
function defaultBaseUrl(): string {
  const file = join(process.cwd(), ".local/offset");
  const offset = existsSync(file) ? Number(readFileSync(file, "utf8").trim()) : 0;
  return `http://localhost:${3000 + offset}`;
}

/** Entra como a pessoa do seed no contexto do navegador (cookies no host do `baseURL`). */
export async function loginAs(
  context: BrowserContext,
  who: StaffKey,
  baseURL: string = defaultBaseUrl(),
): Promise<void> {
  await addSessionCookies(context, await sessionCookies(who), baseURL);
}

/** Grava os cookies de sessão no contexto (host do `baseURL`). */
export async function addSessionCookies(
  context: BrowserContext,
  cookies: { name: string; value: string }[],
  baseURL: string = defaultBaseUrl(),
): Promise<void> {
  const { hostname } = new URL(baseURL);
  await context.addCookies(
    cookies.map((c) => ({
      name: c.name,
      value: c.value,
      domain: hostname,
      path: "/",
      httpOnly: false,
      secure: false,
      sameSite: "Lax" as const,
    })),
  );
}
