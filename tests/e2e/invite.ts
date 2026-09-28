import { expect, type Page } from "@playwright/test";

/**
 * Convite de login (P2-T10): aparece como diálogo modal depois de salvar, seguir, criar alerta
 * ou coleção. Os testes que não são sobre o convite respondem "Agora não" e seguem.
 */
export async function skipInvite(page: Page) {
  const dialog = page.getByRole("dialog", {
    name: "Quer manter suas fontes e notícias salvas em qualquer dispositivo?",
  });
  await dialog.getByRole("button", { name: "Agora não" }).click();
  await expect(dialog).toBeHidden();
}
