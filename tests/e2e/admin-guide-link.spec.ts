import { expect, test } from "@playwright/test";
import { loginAs, service } from "./studio";

/*
 * GUIA-T5 · "Propor por link" com a página fictícia do portal Sabores MT (servidor de fixtures,
 * `CRAWLER_FIXTURES=1`: nenhuma rede). O Guia pega só os nomes, confere cada lugar nas fontes de
 * dados (Overpass fictício), descarta o que não existe e monta a lista do CityNews; o texto do
 * portal nunca aparece. Roda só no desktop (muda dados compartilhados).
 */

const LIST_TITLE = "As 4 melhores padarias de Cuiabá";
const NAMES = [
  "Padaria Pão Dourado",
  "Padaria Lua Nova",
  "Confeitaria Estrela do Sul",
  "Panificadora Cerrado Vivo",
];

async function cleanup() {
  const db = service();
  const { data: lists } = await db.from("guide_lists").select("id").eq("title", LIST_TITLE);
  const ids = (lists ?? []).map((l) => l.id);
  if (ids.length) {
    await db.from("guide_proposals").delete().in("list_id", ids);
    await db.from("guide_list_items").delete().in("list_id", ids);
    await db.from("guide_lists").delete().in("id", ids);
  }
  await db.from("venues").delete().in("name", NAMES).eq("category", "padaria");
}

test.beforeEach(cleanup);
test.afterEach(cleanup);

test("propor por link: só nomes, lugares conferidos, descartados à vista e lista do CityNews", async ({
  page,
}) => {
  await loginAs(page, "marina", "/estudio/admin/guia/propostas");
  await page.getByRole("button", { name: "Propor por link" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Nada do texto original é copiado");
  const submit = dialog.getByRole("button", { name: "Analisar o link" });
  await expect(submit).toBeDisabled();
  await dialog.getByLabel("Link da lista").fill("https://saboresmt.example/melhores-padarias");
  await submit.click();

  await expect(
    page.getByRole("status").filter({ hasText: /Proposta criada com 4 lugares conferidos/ }),
  ).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("status")).toContainText("1 nome descartado");

  const card = page.getByRole("article", { name: LIST_TITLE });
  await expect(card).toBeVisible();
  await expect(card.getByText("Origem: saboresmt.example")).toBeVisible();
  await expect(
    card.getByText(/Descartados \(não achamos nas fontes\): Padaria Aurora/),
  ).toBeVisible();
  await expect(card.getByText("Reunimos padarias de Cuiabá")).toBeVisible();
  for (const n of NAMES) await expect(card.getByText(n, { exact: false }).first()).toBeVisible();
  // Nada do texto do portal de origem aparece em lugar nenhum da tela.
  await expect(page.getByText("trinta anos")).toHaveCount(0);
  await expect(page.getByText("votação entre os leitores")).toHaveCount(0);

  await card.getByRole("button", { name: "Publicar" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Lista publicada" })).toBeVisible();
  const row = await service()
    .from("guide_lists")
    .select("status, origin")
    .eq("title", LIST_TITLE)
    .single();
  expect(row.data).toEqual({ status: "published", origin: "link" });
});

test("link sem lista de lugares ou fora do ar mostra o motivo, sem criar nada", async ({
  page,
}) => {
  await loginAs(page, "marina", "/estudio/admin/guia/propostas");
  await page.getByRole("button", { name: "Propor por link" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Link da lista").fill("https://folhadocerrado.example/termos");
  await dialog.getByRole("button", { name: "Analisar o link" }).click();
  await expect(dialog.getByRole("alert")).toContainText(/Não encontramos uma lista de lugares/);
  const { data } = await service().from("guide_lists").select("id").eq("title", LIST_TITLE);
  expect(data ?? []).toEqual([]);
});
