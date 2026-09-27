import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/*
 * A vitrine roda sobre o build de produção com CN_SHOW_DS=1 (playwright.config.ts).
 * Critério do plano P0-T9b: 0 violações serious/critical do axe.
 */
const blocking = (impact: string | null | undefined) =>
  impact === "serious" || impact === "critical";

test("vitrine do design system sem violações serious/critical @a11y", async ({ page }) => {
  await page.goto("/design-system");
  await expect(
    page.getByRole("heading", { level: 1, name: "Vitrine do design system" }),
  ).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  const bad = results.violations.filter((v) => blocking(v.impact));
  expect(bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual(
    [],
  );
});

test("vitrine no modo escuro sem violações serious/critical @a11y", async ({ page }) => {
  await page.goto("/design-system");
  await page.getByRole("radio", { name: "Escuro" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const results = await new AxeBuilder({ page }).analyze();
  const bad = results.violations.filter((v) => blocking(v.impact));
  expect(bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual(
    [],
  );
});

test("diálogo modal abre, prende o foco e fecha com Esc @a11y", async ({ page }) => {
  await page.goto("/design-system");
  await page.getByRole("button", { name: "Abrir diálogo" }).click();
  const dialog = page.getByRole("dialog", { name: "Tem certeza de que deseja sair?" }).last();
  await expect(dialog).toBeVisible();
  const results = await new AxeBuilder({ page }).include("dialog[open]").analyze();
  expect(results.violations.filter((v) => blocking(v.impact))).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(page.locator("dialog[open]")).toHaveCount(0);
});

test("mostrar senha funciona pelo teclado", async ({ page }) => {
  await page.goto("/design-system");
  const field = page.getByLabel("Senha", { exact: true });
  await field.focus();
  await page.keyboard.press("Tab");
  const toggle = page.getByRole("button", { name: "Mostrar senha" });
  await expect(toggle).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(field).toHaveAttribute("type", "text");
});

test("fontes: menu de ocultar abre com teclado e fica sem violações @a11y", async ({ page }) => {
  await page.goto("/design-system");
  const trigger = page.getByRole("button", { name: "Ocultar Placar MT" }).first();
  await trigger.focus();
  await page.keyboard.press("Enter");
  const menu = page.getByRole("menu", { name: "Por que ocultar Placar MT?" });
  await expect(menu).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Não tenho interesse" })).toBeFocused();
  const results = await new AxeBuilder({ page }).include("#ds-fontes").analyze();
  expect(results.violations.filter((v) => blocking(v.impact))).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(trigger).toBeFocused();
});
