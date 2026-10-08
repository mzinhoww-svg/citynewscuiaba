import { expect, test, type Locator, type Page } from "@playwright/test";
import { controlFixture, type ControlFixture } from "./control";
import { loginAs, service } from "./studio";

/*
 * Falhas do Control Center (P5-T3; itens 52 e 54 da W3): reprocessa a quarentena mantendo
 * decisões humanas, seleciona todas em quarentena, liga cada falha aos logs do objeto e à execução
 * e, abaixo de `md`, mostra cartões no lugar da tabela, sem rolagem horizontal da página.
 */
let fx: ControlFixture;

test.beforeEach(async () => {
  fx = await controlFixture();
});
test.afterEach(async () => {
  await fx.cleanup();
});

/** Abaixo de `md` (48rem): cartões. */
const isNarrow = (page: Page) => (page.viewportSize()?.width ?? 1280) < 768;

/** A falha do fixture: cartão no celular, linha da tabela no desktop. */
function failureEntry(page: Page, text: string): Locator {
  return isNarrow(page)
    ? page.locator("li[data-failure]").filter({ hasText: text })
    : page.getByRole("row").filter({ hasText: text });
}

async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}

test("falhas: reprocessa a quarentena mantendo decisões humanas", async ({ page }) => {
  await loginAs(page, "diego", "/estudio/control/falhas");
  const entry = failureEntry(page, `tempo esgotado ${fx.mark}`);
  await expect(entry).toContainText("Quarentena");
  await entry.getByRole("checkbox").check();
  await expect(page.getByRole("checkbox", { name: "Manter decisões humanas" })).toBeChecked();
  await page.getByRole("button", { name: "Reprocessar selecionadas" }).click();
  await expect(page.getByRole("status").filter({ hasText: "voltou à fila" })).toBeVisible();
  await expect(failureEntry(page, `tempo esgotado ${fx.mark}`)).toHaveCount(0);
  const { data } = await service()
    .from("pipeline_quarantine")
    .select("resolved_at, resolved_by")
    .eq("id", fx.quarantineId)
    .single();
  expect(data?.resolved_at).not.toBeNull();
});

test("falhas: links para o objeto e a execução; selecionar todas em quarentena", async ({
  page,
}) => {
  await loginAs(page, "diego", "/estudio/control/falhas");
  const entry = failureEntry(page, `tempo esgotado ${fx.mark}`);
  await expect(entry.getByRole("link", { name: /Logs do objeto/ })).toHaveAttribute(
    "href",
    `/estudio/control/logs?item=${encodeURIComponent(fx.itemRef)}`,
  );
  await expect(entry.getByRole("link", { name: /Ver execução/ })).toHaveAttribute(
    "href",
    `/estudio/control/execucoes/${fx.runId}`,
  );

  // Marca ao menos a falha do fixture (o banco é compartilhado com outros testes).
  await page.getByRole("button", { name: "Selecionar todas em quarentena" }).click();
  await expect(entry.getByRole("checkbox")).toBeChecked();
  await page.getByRole("button", { name: "Limpar seleção" }).click();
  await expect(entry.getByRole("checkbox")).not.toBeChecked();
});

test("falhas no celular: cartões visíveis, tabela escondida, sem rolagem horizontal", async ({
  page,
}) => {
  test.skip(!isNarrow(page), "só nos projetos de celular");
  await loginAs(page, "diego", "/estudio/control/falhas");
  await expect(page.getByRole("list", { name: "Falhas do pipeline" })).toBeVisible();
  await expect(page.getByRole("table", { name: "Falhas do pipeline" })).toHaveCount(0);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
});

test("correções e aprovações no celular: cartões no lugar da tabela", async ({ page }) => {
  test.skip(!isNarrow(page), "só nos projetos de celular");
  await loginAs(page, "helena", "/estudio/control/aprovacoes");
  for (const path of ["/estudio/control/aprovacoes", "/estudio/correcoes"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    // A versão em tabela, quando há dados, fica `display:none` abaixo de md.
    await expect(page.getByRole("table")).toHaveCount(0);
    expect(await horizontalOverflow(page), path).toBeLessThanOrEqual(0);
  }
});
