import { expect, type Page } from "@playwright/test";

/**
 * Espera o formulário de conta hidratar (`data-ready` de useHydratedForm). O produto já guarda
 * o que foi digitado antes disso; esperar evita medir o envio nativo sem JavaScript no WebKit.
 */
export async function accountFormReady(page: Page) {
  await expect(page.locator('main form[data-ready="true"]').first()).toBeAttached();
}
