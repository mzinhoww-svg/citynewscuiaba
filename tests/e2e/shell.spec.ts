import { expect, test } from "@playwright/test";

test("home tem landmarks e um h1", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("banner")).toBeVisible();
  await expect(page.getByRole("main")).toBeVisible();
  await expect(page.getByRole("contentinfo")).toBeVisible();
  await expect(page.locator("h1")).toHaveCount(1);
});

test("mobile mostra barra inferior com 5 destinos", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("navigation", { name: "Principal" }).getByRole("link")).toHaveCount(
    5,
  );
});

test("desktop leva a navegação principal no cabeçalho, com editorias e AGORA", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  const banner = page.getByRole("banner");
  const principal = banner.getByRole("navigation", { name: "Principal" });
  await expect(principal.getByRole("link")).toHaveCount(4);
  await expect(principal.getByRole("link", { name: "Início" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  const quick = banner.getByRole("navigation", { name: "Busca e conta" });
  await expect(quick.getByRole("link")).toHaveCount(3);
  await expect(quick.getByRole("link", { name: "Favoritos" })).toBeVisible();
  await expect(banner.getByRole("navigation", { name: "Editorias" })).toBeVisible();
  await expect(banner.getByText("Agora", { exact: true })).toBeVisible();
});

test("rodapé não mostra campos pendentes", async ({ page }) => {
  await page.goto("/");
  const footer = page.getByRole("contentinfo");
  await expect(footer).toContainText("© 2026 CityNews Cuiabá");
  await expect(footer).not.toContainText("PREENCHER");
  await expect(footer.getByText(/CNPJ/)).toHaveCount(0);
});

test("pular para o conteúdo leva ao main", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Pular para o conteúdo" });
  await expect(skip).toBeFocused();
  await expect(skip).toHaveAttribute("href", "#conteudo");
});

test("Estúdio sem sessão manda para o login", async ({ page }) => {
  await page.goto("/estudio");
  await expect(page).toHaveURL(/\/entrar\?next=%2Festudio/);
});
