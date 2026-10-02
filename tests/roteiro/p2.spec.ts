import { expect, test, type Page } from "@playwright/test";
import { forwardedFor } from "../e2e/own-ip";

/*
 * Roteiro exploratório do P2 · conta opcional e privacidade (P2-T10 a T12), com Playwright no
 * lugar do agent-browser (A-026). Cada passo verifica o esperado e captura a tela em 390 × 844
 * (projeto mobile) e 1280 × 800 (desktop) em docs/reports/P2/<tela>-<largura>x<altura>.png.
 * Só roda com CN_ROTEIRO=1:
 *   CN_ROTEIRO=1 pnpm exec playwright test tests/roteiro/p2.spec.ts
 */
test.skip(!process.env.CN_ROTEIRO, "roteiro exploratório: rode com CN_ROTEIRO=1");

const ARTICLE = "/materia/prefeitura-detalha-novo-plano-de-onibus-cpa-centro";

async function shot(page: Page, name: string, fullPage = false) {
  const v = page.viewportSize()!;
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: `docs/reports/P2/${name}-${v.width}x${v.height}.png`,
    fullPage,
    animations: "disabled",
  });
}

test.beforeEach(async ({ page, context, baseURL }) => {
  await context.addCookies([{ name: "cn_consent", value: "v1|m1|p1", url: baseURL! }]);
  await page.setExtraHTTPHeaders(forwardedFor());
});

test("1 · convite depois de salvar e painel da primeira visita", async ({ page }) => {
  await page.goto(ARTICLE);
  await expect(page.locator('[data-ready="true"]').first()).toBeAttached();
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page.getByRole("button", { name: "Agora não" })).toBeVisible();
  await shot(page, "convite-login");
  await page.getByRole("button", { name: "Agora não" }).click();

  await page.evaluate(() => sessionStorage.setItem("cn_qreads", "3"));
  await page.goto("/");
  const panel = page.getByRole("complementary", { name: /Personalize suas fontes/ });
  await expect(panel).toBeVisible();
  await shot(page, "primeira-visita");
  await panel.getByRole("button", { name: "Escolher fontes agora" }).click();
  await expect(panel.getByRole("heading", { name: "Locais" })).toBeVisible();
  await shot(page, "primeira-visita-seletor");
});

test("2 · entrar, erro e criar conta", async ({ page }) => {
  await page.goto("/entrar");
  await shot(page, "entrar", true);
  await page.getByLabel("E-mail", { exact: true }).fill("paulo.rezende@email.com");
  await page.getByLabel("Senha", { exact: true }).fill("errada");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.getByText("E-mail ou senha incorretos")).toBeVisible();
  await shot(page, "entrar-erro");

  await page.goto("/criar-conta");
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page.getByText("Para criar a conta, aceite os termos.")).toBeVisible();
  await page.getByLabel("Senha", { exact: true }).fill("Abcdefg1!xyz");
  await shot(page, "criar-conta-erros", true);
});

test("3 · recuperar, redefinir e confirmar", async ({ page }) => {
  await page.goto("/recuperar-senha");
  await page.getByLabel("E-mail", { exact: true }).fill("alguem@exemplo.com");
  await page.getByRole("button", { name: "Enviar link" }).click();
  await expect(page.getByText("Se houver conta com este e-mail, enviamos um link")).toBeVisible();
  await shot(page, "recuperar-senha-enviado");
  await page.goto("/redefinir-senha");
  await expect(page.getByText("Este link expirou ou já foi usado.")).toBeVisible();
  await shot(page, "redefinir-senha-expirado");
  await page.goto("/confirmar?token=abc&type=signup");
  await shot(page, "confirmar-token");
  await page.goto("/confirmar?estado=expirado");
  await shot(page, "confirmar-expirado");
});

test("4 · migrar, perfil com conta e excluir", async ({ page }) => {
  await page.goto("/fontes/mt-agora");
  await expect(page.locator('[data-ready="true"]').first()).toBeAttached();
  await page.getByRole("button", { name: "Seguir MT Agora" }).click();
  await page.getByRole("button", { name: "Agora não" }).click();
  await page.goto(ARTICLE);
  await expect(page.locator('[data-ready="true"]').first()).toBeAttached();
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await page.getByRole("button", { name: "Criar conta" }).click();
  await page.getByLabel("Nome de exibição").fill("Ana Cuiabana");
  await page.getByLabel("E-mail", { exact: true }).fill(`roteiro-${Date.now()}@exemplo.com`);
  await page.getByLabel("Senha", { exact: true }).fill("senha-forte-123");
  await page.getByLabel(/Li e aceito os Termos/).check();
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page.getByRole("button", { name: "Levar selecionados" })).toBeVisible();
  await shot(page, "migrar", true);
  await page.getByRole("button", { name: "Levar selecionados" }).click();
  await expect(page.getByText("1 fonte e 1 salvo sincronizados")).toBeVisible();
  await shot(page, "migrar-sucesso");

  await page.goto("/perfil");
  await expect(page.getByRole("heading", { name: "Sua conta" })).toBeVisible();
  await shot(page, "perfil-conta", true);
  await page.getByRole("button", { name: "Excluir conta" }).click();
  await page.getByLabel("Digite EXCLUIR para confirmar").fill("EXCLUIR");
  await shot(page, "perfil-excluir");
});

test("5 · perfil sem conta e recomendações", async ({ page }) => {
  await page.goto("/perfil");
  await expect(page.getByRole("heading", { name: "Seu perfil neste navegador" })).toBeVisible();
  await shot(page, "perfil-anonimo", true);
  await page.goto("/privacidade/recomendacoes");
  await expect(page.getByRole("switch", { name: "Recomendações pelo que você lê" })).toBeVisible();
  await shot(page, "privacidade-recomendacoes", true);
});
