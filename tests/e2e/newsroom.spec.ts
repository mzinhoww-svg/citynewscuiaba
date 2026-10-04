import { expect, test } from "@playwright/test";
import { createArticle, loginAs, removeArticles, service, tag } from "./studio";

/*
 * Redação e fila (E01, E02 · P4-T2): abas, faixa de aviso sobre itens automáticos,
 * despublicação de item automático com motivo obrigatório (decisão humana "unpublish").
 */
const created: string[] = [];
test.afterAll(() => removeArticles(created));

test("editora vê exceções e despublica automático com motivo", async ({ page }) => {
  const t = tag();
  const id = await createArticle({
    title: `Alerta de baixa umidade segue até sexta ${t}`,
    kind: "normalized",
    section_slug: "clima",
    agent_id: "write",
    status: "published",
    publish_mode: "auto",
    published_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
  });
  created.push(id);

  await loginAs(page, "marina");
  await page.goto("/estudio/fila?aba=auto24h");
  const row = page.getByRole("row", { name: new RegExp(`baixa umidade segue até sexta ${t}`) });
  await row.getByRole("button", { name: "Despublicar" }).click();
  // Motivo é obrigatório: sem ele, não confirma.
  await page.getByRole("button", { name: "Confirmar" }).click();
  await expect(page.getByText("Escreva o motivo da despublicação")).toBeVisible();
  await page.getByLabel("Motivo").fill("Data incorreta no alerta");
  await page.getByRole("button", { name: "Confirmar" }).click();
  await expect(page.getByRole("status")).toContainText("Despublicada");

  const db = service();
  const { data: a } = await db.from("articles").select("status").eq("id", id).single();
  expect(a?.status).toBe("unpublished");
  const { data: d } = await db
    .from("decisions")
    .select("human_decision, rationale")
    .eq("object_ref", `article:${id}`)
    .single();
  expect(d).toMatchObject({ human_decision: "unpublish", rationale: "Data incorreta no alerta" });
});

test("newsroom mostra KPIs, abas e a fila de exceção do pipeline", async ({ page }) => {
  await loginAs(page, "marina");
  await expect(page.getByRole("heading", { level: 1, name: "Redação" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Indicadores do dia" })).toBeVisible();
  await page
    .getByRole("link", { name: /Fila de exceção/ })
    .first()
    .click();
  await expect(page).toHaveURL(/aba=exceptions/);
  const row = page.getByRole("row", { name: /furto de fios de cobre/ });
  await expect(row).toContainText("Reter");
  await expect(row).toContainText("Tema sensível");
});

test("fila filtra por editoria e atribui em lote", async ({ page }) => {
  const t = tag();
  const id = await createArticle({ title: `Pauta de teste para atribuir ${t}` });
  created.push(id);
  await loginAs(page, "marina");
  await page.goto("/estudio/fila?editoria=cidade&estado=draft");
  const row = page.getByRole("row", { name: new RegExp(`atribuir ${t}`) });
  await row.getByRole("checkbox").check();
  await page.getByLabel("Atribuir a", { exact: true }).selectOption({ label: "Otávio Reis" });
  await page.getByRole("button", { name: "Atribuir selecionadas" }).click();
  await expect(page.getByRole("status")).toContainText("1 matéria atribuída");
  await expect(page.getByRole("row", { name: new RegExp(`atribuir ${t}`) })).toContainText(
    "Otávio Reis",
  );
});

test("jornalista não vê ações de despublicar nem de lote", async ({ page }) => {
  await loginAs(page, "rafael");
  await page.goto("/estudio/fila?aba=mine");
  await expect(page.getByRole("heading", { level: 1, name: "Fila de matérias" })).toBeVisible();
  await expect(page.getByRole("row", { name: /Festival de siriri/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Despublicar" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Atribuir selecionadas" })).toHaveCount(0);
});
