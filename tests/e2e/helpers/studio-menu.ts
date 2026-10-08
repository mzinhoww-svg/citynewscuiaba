import { expect, type Locator, type Page } from "@playwright/test";
import { expectHydrated } from "./hydration";

/**
 * A-123: abaixo de `lg` o menu do Estúdio só existe dentro da gaveta aberta por "Abrir menu".
 * Abre a gaveta quando o botão está visível e devolve a navegação do Estúdio; no desktop devolve a
 * navegação lateral, sempre visível.
 */
export async function openStudioMenu(page: Page): Promise<Locator> {
  const menu = page.getByRole("button", { name: "Abrir menu" });
  if (await menu.isVisible()) {
    await expectHydrated(menu);
    await menu.click();
    await expect(page.getByRole("dialog", { name: "Menu do Estúdio" })).toBeVisible();
  }
  return page.getByRole("navigation", { name: "Estúdio" });
}

/** Fecha a gaveta do menu, se estiver aberta (celular). */
export async function closeStudioMenu(page: Page): Promise<void> {
  const drawer = page.getByRole("dialog", { name: "Menu do Estúdio" });
  if (await drawer.isVisible()) {
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
  }
}
