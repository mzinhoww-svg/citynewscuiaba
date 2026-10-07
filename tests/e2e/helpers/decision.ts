import { expect, type Locator, type Page } from "@playwright/test";
import { expectHydrated } from "./hydration";

/**
 * UX-W3-T1 (item 45): abaixo de `xl` a decisão da revisão fica numa barra fixa no rodapé com
 * Aprovar, Pedir ajuste e o menu "Mais ações"; Rejeitar, Reprocessar e Editar moram nesse menu.
 * No desktop continuam como botões no painel. Devolve o gatilho que a pessoa usa para a ação
 * (o botão do painel ou "Mais ações"), que é para onde o foco volta ao fechar o diálogo.
 */
export async function decisionTrigger(page: Page, action: string): Promise<Locator> {
  const more = page.getByRole("button", { name: "Mais ações" });
  const button = page.getByRole("button", { name: action, exact: true });
  // Espera a barra aparecer antes de decidir (a página pode ainda estar carregando).
  await expect(more.or(button).first()).toBeVisible();
  const trigger = (await more.isVisible()) ? more : button;
  await expectHydrated(trigger);
  return trigger;
}

/** Aciona a ação da decisão com clique (abrindo "Mais ações" quando é o caso). */
export async function clickDecision(page: Page, action: string): Promise<Locator> {
  const trigger = await decisionTrigger(page, action);
  await trigger.click();
  const item = page.getByRole("menuitem", { name: action, exact: true });
  if ((await trigger.getAttribute("aria-haspopup")) !== null) {
    await expect(item).toBeVisible();
    await item.click();
  }
  return trigger;
}

/**
 * Aciona a ação só com o teclado: Enter no gatilho; no menu, ↓ até o item e Enter.
 * O foco precisa estar no gatilho antes (`trigger.focus()` ou Tab).
 */
export async function pressDecision(page: Page, trigger: Locator, action: string): Promise<void> {
  await page.keyboard.press("Enter");
  if ((await trigger.getAttribute("aria-haspopup")) === null) return;
  const item = page.getByRole("menuitem", { name: action, exact: true });
  await expect(page.getByRole("menuitem").first()).toBeFocused();
  for (let i = 0; i < 8 && !(await item.evaluate((el) => el === document.activeElement)); i++)
    await page.keyboard.press("ArrowDown");
  await expect(item).toBeFocused();
  await page.keyboard.press("Enter");
}
