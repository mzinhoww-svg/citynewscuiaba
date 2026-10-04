import { expect, test } from "@playwright/test";
import { forwardedFor } from "../e2e/own-ip";
import { expectNoSeriousViolations, structureFindings } from "./axe";

/*
 * UI-T13 · Pergunte ao CityNews como chat: axe (WCAG 2.2 AA, 0 serious/critical) no chat vazio,
 * com resposta e com a fonte aberta pela citação, nos temas claro e escuro; teclado (Enter envia,
 * foco volta ao campo); modo simples sem JavaScript. 390 e 1280 px vêm dos projetos `mobile` e
 * `desktop` do playwright.config.ts.
 */
const Q = "O que aconteceu em Cuiabá hoje?";

test.beforeEach(async ({ context, baseURL }) => {
  await context.setExtraHTTPHeaders(forwardedFor());
  await context.addCookies([{ name: "cn_consent", value: "v1|m1|p1", url: baseURL! }]);
});

for (const scheme of ["light", "dark"] as const) {
  test(`chat vazio e com resposta, sem violações (${scheme}) @a11y`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto("/pergunte");
    await expect(page.getByRole("list", { name: "Perguntas para começar" })).toBeVisible();
    expect(await structureFindings(page)).toEqual([]);
    await expectNoSeriousViolations(page);

    await page.goto(`/pergunte?q=${encodeURIComponent(Q)}`);
    const reply = page.getByRole("article", { name: "Resposta do CityNews" });
    await expect(reply).toBeVisible();
    await expect(page.getByRole("status")).toHaveText("Resposta pronta.");
    await expectNoSeriousViolations(page);

    await reply.getByRole("link", { name: "Fonte 1", exact: true }).first().click();
    await expect(page.locator("[aria-current='true']:visible").first()).toBeVisible();
    await expectNoSeriousViolations(page);
  });
}

test("teclado: Enter envia, Shift+Enter quebra linha e o foco fica no campo @a11y", async ({
  page,
}) => {
  await page.goto("/pergunte");
  const field = page.getByRole("textbox", { name: "Sua pergunta" });
  await field.focus();
  await page.keyboard.type("Qualidade do ar");
  await page.keyboard.press("Shift+Enter");
  await page.keyboard.type("em Cuiabá");
  await expect(field).toHaveValue("Qualidade do ar\nem Cuiabá");
  await page.keyboard.press("Enter");
  await expect(field).toHaveValue("");
  await expect(field).toBeFocused();
  await expect(page.getByRole("status")).not.toHaveText("");
});

// O modo simples é o HTML que quem está sem JavaScript recebe (o fluxo sem JS fica em
// tests/e2e/ask.spec.ts). O axe precisa de JavaScript na página para medir, então mede o mesmo
// HTML do servidor com JavaScript ligado.
test("modo simples (HTML de quem está sem JavaScript) sem violações @a11y", async ({ page }) => {
  await page.goto(`/pergunte?q=${encodeURIComponent(Q)}&modo=simples`);
  await expect(page.getByRole("heading", { name: "Resposta do CityNews" })).toBeVisible();
  await expectNoSeriousViolations(page);
});
