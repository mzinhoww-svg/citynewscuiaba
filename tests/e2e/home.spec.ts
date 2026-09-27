import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("home abre em pt-BR com o nome do portal", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "pt-BR");
  await expect(page.getByRole("heading", { level: 1, name: "CityNews Cuiabá" })).toBeVisible();
});

test("home sem violações do axe @a11y", async ({ page }) => {
  await page.goto("/");
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});
