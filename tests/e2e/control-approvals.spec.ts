import { expect, test } from "@playwright/test";
import { loginAs, service, STAFF, tag } from "./studio";

/*
 * Aprovação dupla (P5-T1; Review Focus 1): quem pede vê o pedido sem as ações e lê que a
 * aprovação precisa ser de outra pessoa; outra pessoa com papel aprova ou recusa, e a decisão
 * aparece nas decididas. Usa role.admin (autorização, sem efeito colateral no seed) para os
 * projetos desktop e mobile rodarem em paralelo.
 */
const THIAGO = "c1000000-0000-4000-8000-000000000008";
const created: string[] = [];
test.afterAll(async () => {
  if (created.length) await service().from("approvals").delete().in("id", created);
});

async function pendingByHelena(justification: string) {
  const { data, error } = await service()
    .from("approvals")
    .insert({
      kind: "role.admin",
      target_ref: THIAGO,
      requested_by: STAFF.helena.id,
      justification,
    })
    .select("id")
    .single();
  if (error) throw error;
  created.push(data.id);
  return data.id;
}

test("quem pede não aprova; outra pessoa aprova e a decisão fica registrada", async ({ page }) => {
  const t = tag();
  const why = `Cobertura de férias ${t}`;
  const id = await pendingByHelena(why);

  await loginAs(page, "helena", "/estudio/control/aprovacoes");
  const own = page.getByRole("article").filter({ hasText: why });
  await expect(
    own.getByText("A aprovação precisa ser de outra pessoa", { exact: false }),
  ).toBeVisible();
  await expect(own.getByRole("button", { name: /Aprovar/ })).toHaveCount(0);

  await page.context().clearCookies();
  await loginAs(page, "marina", "/estudio/control/aprovacoes");
  const card = page.getByRole("article").filter({ hasText: why });
  await card.getByRole("button", { name: /^Aprovar:/ }).click();
  await expect(page.getByRole("status").filter({ hasText: "Aprovação registrada." })).toBeVisible();
  await expect(page.getByRole("article").filter({ hasText: why })).toHaveCount(0);

  const row = await service().from("approvals").select("*").eq("id", id).single();
  expect(row.data).toMatchObject({ status: "approved", approved_by: STAFF.marina.id });
});

test("recusar registra a recusa e tira o pedido das pendentes", async ({ page }) => {
  const t = tag();
  const why = `Pedido para recusar ${t}`;
  const id = await pendingByHelena(why);
  await loginAs(page, "marina", "/estudio/control/aprovacoes");
  const card = page.getByRole("article").filter({ hasText: why });
  await card.getByRole("button", { name: /^Recusar:/ }).click();
  await expect(page.getByRole("status").filter({ hasText: "Recusa registrada." })).toBeVisible();
  const row = await service().from("approvals").select("status, approved_by").eq("id", id).single();
  expect(row.data).toEqual({ status: "rejected", approved_by: STAFF.marina.id });
});

test("sem papel para pedir ou decidir, a tela não abre", async ({ page }) => {
  await loginAs(page, "juliana");
  await page.goto("/estudio/control/aprovacoes");
  await expect(page).toHaveURL(/motivo=sem-permissao/);
});
