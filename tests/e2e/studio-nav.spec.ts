import { expect, test } from "@playwright/test";
import { closeStudioMenu, openStudioMenu } from "./helpers/studio-menu";
import { loginAs, service, tag } from "./studio";

/*
 * UX-W3-T3 · itens 50, 51 e 60: menu do Estúdio com busca no trilho do desktop, grupos
 * recolhíveis lembrados, subgrupos no Control Center, Contingência em destaque, contagens e nomes
 * em pt-BR (Redação, Testar prompts, Registros).
 */

test("admin: Contingência abre o Control Center e os subgrupos aparecem", async ({ page }) => {
  await loginAs(page, "helena");
  const nav = await openStudioMenu(page);
  await expect(nav.getByRole("link", { name: "Contingência" })).toBeVisible();
  await expect(nav.getByRole("group", { name: "Operação" })).toBeVisible();
  await expect(nav.getByRole("group", { name: "IA" })).toBeVisible();
  await expect(nav.getByRole("group", { name: "Fontes e regras" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Registros" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Testar prompts" })).toBeVisible();
  await expect(nav.getByText("Administração", { exact: true }).first()).toBeVisible();
  await closeStudioMenu(page);
});

test("busca no menu: “regis” acha Registros (desktop no trilho, celular na gaveta)", async ({
  page,
}) => {
  await loginAs(page, "helena");
  const nav = await openStudioMenu(page);
  const scope = (await page.getByRole("button", { name: "Abrir menu" }).isVisible())
    ? page.getByRole("dialog", { name: "Menu do Estúdio" })
    : nav;
  const search = scope.getByRole("searchbox", { name: "Buscar no menu" });
  await search.fill("regis");
  await expect(nav.getByRole("link", { name: "Registros" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Usuários" })).toHaveCount(0);
  // Esc num campo de busca preenchido primeiro limpa o texto (comportamento nativo do navegador,
  // que não deixa o Esc chegar à gaveta); o menu volta inteiro e o próximo Esc fecha a gaveta.
  await page.keyboard.press("Escape");
  await expect(search).toHaveValue("");
  await expect(nav.getByRole("link", { name: "Usuários" })).toBeVisible();
  await closeStudioMenu(page);
});

test("grupo recolhido continua recolhido depois de recarregar", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "trilho lateral só no desktop");
  await loginAs(page, "helena");
  const nav = page.getByRole("navigation", { name: "Estúdio" });
  const users = nav.getByRole("link", { name: "Usuários" });
  await expect(users).toBeVisible();
  await nav.locator("summary", { hasText: "Administração" }).click();
  await expect(users).toBeHidden();
  await page.reload();
  await expect(nav.getByRole("link", { name: "Usuários" })).toBeHidden();
  await nav.locator("summary", { hasText: "Administração" }).click();
  await expect(nav.getByRole("link", { name: "Usuários" })).toBeVisible();
});

test("contagem de denúncias vencidas no menu, com nome acessível", async ({ page }) => {
  const db = service();
  const ref = `teste:menu-${tag()}`;
  const { data } = await db
    .from("reports")
    .insert({
      content_ref: ref,
      kind: "other",
      message: "contagem do menu",
      due_at: new Date(Date.now() - 3_600_000).toISOString(),
    })
    .select("id")
    .single();
  try {
    await loginAs(page, "marina");
    const nav = await openStudioMenu(page);
    await expect(nav.getByRole("link", { name: /^Denúncias, \d+ vencidas?$/ })).toBeVisible();
    await closeStudioMenu(page);
  } finally {
    if (data) await db.from("reports").delete().eq("id", data.id);
  }
});

test("abas da fila mostram a contagem", async ({ page }) => {
  await loginAs(page, "marina", "/estudio/fila");
  const tabs = page.getByRole("navigation", { name: "Abas da fila" });
  await expect(tabs.getByRole("link", { name: /^Fila de exceção, \d+ itens?$/ })).toBeVisible();
  // As contagens só para leitor de tela (absolutas) não podem escapar da rolagem das abas: no
  // celular a página ficava com 800 px e o navegador afastava o zoom da tela inteira.
  const width = page.viewportSize()?.width ?? 0;
  expect(await page.evaluate(() => window.innerWidth)).toBe(width);
});
