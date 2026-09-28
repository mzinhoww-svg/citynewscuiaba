import { randomUUID } from "node:crypto";
import { expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { loadEnvConfig } from "@next/env";
import type { Database } from "@/lib/db/types";
import { forwardedFor } from "./own-ip";

/*
 * Apoio dos testes do Estúdio (P4): login com os usuários de seed pelo formulário de /entrar e
 * dados próprios por teste (projetos desktop e mobile rodam em paralelo e não podem disputar a
 * mesma matéria).
 */
loadEnvConfig(process.cwd(), true, { info: () => {}, error: console.error });

export const SEED_PASSWORD = "citynews-local-123";
export const STAFF = {
  helena: { id: "c1000000-0000-4000-8000-000000000001", email: "helena.costa@citynews.local" },
  marina: { id: "c1000000-0000-4000-8000-000000000002", email: "marina.arruda@citynews.local" },
  otavio: { id: "c1000000-0000-4000-8000-000000000003", email: "otavio.reis@citynews.local" },
  juliana: { id: "c1000000-0000-4000-8000-000000000004", email: "juliana.campos@citynews.local" },
  rafael: { id: "c1000000-0000-4000-8000-000000000005", email: "rafael.siqueira@citynews.local" },
  beatriz: { id: "c1000000-0000-4000-8000-000000000006", email: "beatriz.lemos@citynews.local" },
  carlos: { id: "c1000000-0000-4000-8000-000000000009", email: "carlos.nunes@citynews.local" },
  diego: { id: "c1000000-0000-4000-8000-000000000007", email: "diego.prado@citynews.local" },
  thiago: { id: "c1000000-0000-4000-8000-000000000008", email: "thiago.moraes@citynews.local" },
} as const;
export type Staff = keyof typeof STAFF;

/** Entra no Estúdio como um usuário de seed e espera o Newsroom. */
export async function loginAs(page: Page, who: Staff, next = "/estudio") {
  await page.setExtraHTTPHeaders(forwardedFor());
  await page.goto(`/entrar?next=${encodeURIComponent(next)}`);
  await page.getByLabel("E-mail", { exact: true }).fill(STAFF[who].email);
  await page.getByLabel("Senha", { exact: true }).fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${next.replace(/[?]/g, "\\?")}$`));
}

export function service() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("variáveis do Supabase ausentes");
  return createClient<Database>(url, key, { auth: { persistSession: false } });
}

export const tag = () => randomUUID().slice(0, 6);

const doc = (text: string) => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});

/** Matéria de teste (apagada no fim). Padrão: rascunho original em Cidade. */
export async function createArticle(
  fields: Partial<Database["public"]["Tables"]["articles"]["Insert"]> & { title: string },
) {
  const db = service();
  const id = randomUUID();
  const row = {
    id,
    slug: `teste-p4-${id.slice(0, 8)}`,
    kind: "original" as const,
    section_slug: "cidade",
    dek: "Linha fina de teste do Estúdio.",
    body: doc("Parágrafo de teste do Estúdio."),
    status: "draft" as const,
    ...fields,
  };
  const { error } = await db.from("articles").insert(row);
  if (error) throw error;
  await db.from("article_versions").insert({
    article_id: id,
    number: 1,
    snapshot: { title: row.title, dek: row.dek, body: row.body },
    origin: row.agent_id ? "ai" : "human",
    author_id: row.author_id ?? null,
  });
  return id;
}

export async function removeArticles(ids: string[]) {
  if (ids.length === 0) return;
  const db = service();
  await db
    .from("decisions")
    .delete()
    .in(
      "object_ref",
      ids.map((i) => `article:${i}`),
    );
  await db.from("articles").delete().in("id", ids);
}
