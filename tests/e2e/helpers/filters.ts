import { expect, type Page } from "@playwright/test";
import { expectHydrated } from "./hydration";

/**
 * A-140: os painéis de filtro (`CollapsibleFilters`) começam recolhidos abaixo de `lg`. Abre todos
 * os que estiverem com o corpo escondido; no desktop o corpo já aparece (CSS) e nada acontece.
 * Decide pela visibilidade do corpo, não pelo `aria-expanded`, que antes da hidratação vale
 * `false` mesmo com o painel aberto no desktop.
 *
 * Espera o primeiro painel ficar visível antes de decidir: logo depois do `load`, o conteúdo
 * transmitido em partes ainda pode estar no contêiner escondido do streaming, e um painel
 * "invisível" ali não é um painel fechado (o helper pulava e o teste falhava no celular).
 */
export async function openFilters(page: Page): Promise<void> {
  const panels = page.locator("[data-collapsible-filters]");
  await expect(panels.first()).toBeVisible();
  for (const panel of await panels.all()) {
    if (!(await panel.isVisible())) continue;
    const body = panel.locator("[data-filters-body]");
    if (await body.isVisible()) continue;
    const button = panel.locator(":scope > div > button[aria-controls]");
    await expectHydrated(button);
    await button.click();
    await expect(body).toBeVisible();
  }
}
