import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/*
 * Convites (C01 e P23, P2-T10): convite contextual depois de salvar, com os textos fixos e
 * "Agora não"; 1 por gatilho a cada 7 dias; Esc vale como "Agora não". Painel da primeira
 * visita depois de 3 leituras qualificadas na sessão, não modal.
 */
const ARTICLE = "/materia/prefeitura-detalha-novo-plano-de-onibus-cpa-centro";
const INVITE = "Quer manter suas fontes e notícias salvas em qualquer dispositivo?";
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "cn_consent", value: "v1|m0|p0", url: baseURL! }]);
});

async function openArticle(page: Page) {
  await page.goto(ARTICLE);
  await expect(page.locator('[data-ready="true"]').first()).toBeAttached();
}

const save = (page: Page) => page.getByRole("button", { name: "Salvar", exact: true });
const invite = (page: Page) => page.getByRole("dialog", { name: INVITE });

test("convite após salvar tem as três ações e o texto fixo", async ({ page }) => {
  await openArticle(page);
  await save(page).click();
  await expect(page.getByText(INVITE)).toBeVisible();
  for (const b of ["Criar conta", "Entrar", "Agora não"])
    await expect(page.getByRole("button", { name: b })).toBeVisible();
  await expect(page.getByText("Você pode continuar sem fazer login.")).toBeVisible();
});

test("Agora não fecha, devolve o foco e o mesmo gatilho não volta em 7 dias", async ({ page }) => {
  await openArticle(page);
  await save(page).click();
  await invite(page).getByRole("button", { name: "Agora não" }).click();
  await expect(invite(page)).toBeHidden();
  await expect(save(page)).toHaveAttribute("aria-pressed", "true");
  await expect(save(page)).toBeFocused();
  // Desfaz e salva de novo: o convite de "salvar" já apareceu nesta semana.
  await save(page).click();
  await expect(save(page)).toHaveAttribute("aria-pressed", "false");
  await save(page).click();
  await expect(save(page)).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Salvo neste aparelho.")).toBeVisible();
  await expect(invite(page)).toHaveCount(0);
  // Oito dias depois volta a convidar.
  await page.evaluate(() => {
    const old = new Date(Date.now() - 8 * 86_400_000).toISOString();
    localStorage.setItem("cn_invites", JSON.stringify([{ trigger: "save", at: old }]));
  });
  await save(page).click();
  await save(page).click();
  await expect(invite(page)).toBeVisible();
});

test("Esc fecha como Agora não e o conteúdo continua acessível", async ({ page }) => {
  await openArticle(page);
  await save(page).click();
  await expect(invite(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(invite(page)).toBeHidden();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("Criar conta leva ao cadastro e volta para a matéria", async ({ page }) => {
  await openArticle(page);
  await save(page).click();
  await invite(page).getByRole("button", { name: "Criar conta" }).click();
  await expect(page).toHaveURL(/\/criar-conta\?next=%2Fmateria%2F/);
});

test("convite sem violações graves de acessibilidade @a11y", async ({ page }) => {
  await openArticle(page);
  await save(page).click();
  await expect(invite(page)).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const r = await new AxeBuilder({ page }).withTags(TAGS).include("dialog").analyze();
  const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(bad, JSON.stringify(bad.map((v) => [v.id, v.nodes.map((n) => n.target)]))).toEqual([]);
});

test.describe("primeira visita", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      if (!sessionStorage.getItem("cn_qreads")) sessionStorage.setItem("cn_qreads", "3");
    });
  });

  test("depois de 3 leituras oferece fontes, sem bloquear a página", async ({ page }) => {
    await page.goto("/");
    const panel = page.getByRole("complementary", {
      name: "Personalize suas fontes e receba uma experiência mais relevante.",
    });
    await expect(panel).toBeVisible();
    for (const b of [
      "Escolher fontes agora",
      "Continuar sem personalizar",
      "Entrar ou criar conta",
    ])
      await expect(panel.getByRole("button", { name: b })).toBeVisible();
    // Não modal: o resto da página continua usável.
    await expect(page.getByRole("link", { name: "Pular para o conteúdo" })).toBeAttached();

    await panel.getByRole("button", { name: "Escolher fontes agora" }).click();
    await expect(panel.getByRole("heading", { name: "Locais" })).toBeVisible();
    // 12 fontes no seed; Rádio Pantanal está `paused` (seed do painel, FS-T1) e não é oferecida.
    await expect(panel.getByRole("button", { name: /^Seguir / })).toHaveCount(11);
    await panel.getByRole("button", { name: "Seguir Folha do Cerrado" }).click();
    await expect(panel.getByRole("status")).toHaveText("1 fonte seguida neste navegador.");
    await panel.getByRole("button", { name: "Concluir" }).click();
    await expect(panel).toBeHidden();

    await page.reload();
    await expect(page.locator("main")).toBeVisible();
    await expect(page.getByRole("complementary", { name: /Personalize suas fontes/ })).toHaveCount(
      0,
    );
    await page.goto("/favoritos");
    await page.getByRole("tab", { name: "Fontes seguidas" }).click();
    await expect(page.getByRole("link", { name: "Folha do Cerrado" })).toBeVisible();
  });

  test("Continuar sem personalizar decide e não volta", async ({ page }) => {
    await page.goto("/");
    const panel = page.getByRole("complementary", { name: /Personalize suas fontes/ });
    await panel.getByRole("button", { name: "Continuar sem personalizar" }).click();
    await expect(panel).toBeHidden();
    await page.goto("/explorar");
    await expect(page.locator("main")).toBeVisible();
    await expect(page.getByRole("complementary", { name: /Personalize suas fontes/ })).toHaveCount(
      0,
    );
  });

  test("antes de 3 leituras não aparece", async ({ page }) => {
    await page.addInitScript(() => sessionStorage.setItem("cn_qreads", "2"));
    await page.goto("/");
    await expect(page.locator("main")).toBeVisible();
    await expect(page.getByRole("complementary", { name: /Personalize suas fontes/ })).toHaveCount(
      0,
    );
  });
});
