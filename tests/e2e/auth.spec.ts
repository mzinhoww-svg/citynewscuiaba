import { loadEnvConfig } from "@next/env";
import { expect, test } from "@playwright/test";
import { expectNoSeriousViolations } from "../a11y/axe";
import { accountFormReady } from "./account-form";

/*
 * Login e cadastro com o Google em destaque (UI-T12, spec de UI pública §4.7 e critério 7 da
 * §6). Roda nos projetos `mobile` (390) e `desktop` (1280). O provedor depende do ambiente do
 * servidor (`AUTH_GOOGLE_ENABLED`, B-006): ligado, o botão é o primeiro controle, branco, com o
 * "G" e 56 px; desligado, não sobra botão, divisor nem frase de indisponível (Review Focus 1).
 */
loadEnvConfig(process.cwd(), true, { info: () => {}, error: console.error });
// Mesma regra de `googleEnabled` (`src/lib/auth/reader.ts`), que é server-only e não importa aqui.
const GOOGLE_ON = ["1", "true"].includes(process.env.AUTH_GOOGLE_ENABLED ?? "");

const FOCUSABLE =
  'main button:not([disabled]), main a[href], main input:not([type="hidden"]), main select, main textarea';

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "cn_consent", value: "v1|m0|p0", url: baseURL! }]);
});

for (const [path, name] of [
  ["/entrar", "login"],
  ["/criar-conta", "cadastro"],
] as const) {
  test(`${name}: Google no topo, divisor, saída sem entrar e benefícios`, async ({ page }) => {
    await page.goto(path);
    await accountFormReady(page);
    const main = page.locator("main");
    const google = main.getByRole("button", { name: "Continuar com o Google" });

    if (GOOGLE_ON) {
      await expect(google).toBeVisible();
      const box = await google.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(56);
      await expect(google.locator('img[src="/brand/google-g.svg"]')).toHaveAttribute("alt", "");
      const bg = await google.evaluate((el) => getComputedStyle(el).backgroundColor);
      expect(bg).toBe("rgb(255, 255, 255)");
      const firstText = await page
        .locator(FOCUSABLE)
        .evaluateAll((els) => els.map((el) => el.textContent?.trim() ?? ""));
      expect(firstText[0]).toBe("Continuar com o Google");
      await expect(main.getByText("ou use seu e-mail")).toBeVisible();
      await expect(main.getByText("Usamos seu nome e e-mail para criar a conta.")).toBeVisible();
    } else {
      await expect(main.getByRole("button", { name: /Google/ })).toHaveCount(0);
      await expect(main.getByText("ou use seu e-mail")).toHaveCount(0);
    }
    await expect(main).not.toContainText(/não está disponível|indisponível/i);

    await expect(main.getByRole("link", { name: "Continuar sem entrar" })).toBeVisible();
    const benefits = main.getByRole("list", { name: "O que a conta guarda para você" });
    await expect(benefits).toBeVisible();
    await expect(benefits.getByRole("listitem")).toHaveText([
      "Salvos em todos os aparelhos",
      "Alertas do seu bairro",
      "Fontes que você segue",
    ]);

    // Celular: benefícios acima do formulário. Desktop: ao lado (coluna da esquerda).
    const listBox = (await benefits.boundingBox())!;
    const emailBox = (await main.getByLabel("E-mail", { exact: true }).boundingBox())!;
    if ((page.viewportSize()?.width ?? 0) >= 1024) {
      expect(listBox.x + listBox.width).toBeLessThanOrEqual(emailBox.x);
    } else {
      expect(listBox.y + listBox.height).toBeLessThanOrEqual(emailBox.y);
    }
  });

  test(`${name}: sem violação séria do axe @a11y`, async ({ page }) => {
    await page.goto(path);
    await accountFormReady(page);
    await expectNoSeriousViolations(page);
  });
}

test("login: ordem Entrar, Esqueci a senha e Entrar sem senha", async ({ page }) => {
  await page.goto("/entrar");
  await accountFormReady(page);
  const main = page.locator("main");
  const entrar = (await main.getByRole("button", { name: "Entrar", exact: true }).boundingBox())!;
  const semSenha = (await main.getByRole("button", { name: "Entrar sem senha" }).boundingBox())!;
  const senha = (await main.getByLabel("Senha", { exact: true }).boundingBox())!;
  expect(senha.y).toBeLessThan(entrar.y);
  expect(entrar.y).toBeLessThan(semSenha.y);
  await expect(main.getByRole("link", { name: "Esqueci a senha" })).toBeVisible();
});
