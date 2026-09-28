import AxeBuilder from "@axe-core/playwright";
import { loadEnvConfig } from "@next/env";
import { expect, test } from "@playwright/test";
import { signNewsletterToken } from "../../src/lib/newsletter/token";
import { forwardedFor } from "./own-ip";

/*
 * Newsletter (P19), P2-T9: listas com amostra, inscrição só com e-mail e confirmação dupla,
 * centro de preferências por link assinado (confirmar, mudar, sair e voltar; link expirado).
 * O teste assina o link com o mesmo segredo do servidor (.env.local ou ambiente do CI).
 */
loadEnvConfig(process.cwd());
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

test.beforeEach(async ({ context, baseURL, page }) => {
  await context.addCookies([{ name: "cn_consent", value: "v1|m0|p0", url: baseURL! }]);
  await page.setExtraHTTPHeaders(forwardedFor());
});

test("listas com amostra e inscrição com confirmação dupla", async ({ page }) => {
  await page.goto("/newsletter");
  for (const name of ["Cuiabá em 5 minutos", "Agenda do fim de semana", "Política da semana"])
    await expect(page.getByRole("heading", { name })).toBeVisible();
  await expect(page.getByText("Amostra da última edição").first()).toBeVisible();

  const form = page.locator("form").filter({ has: page.getByRole("textbox", { name: "E-mail" }) });
  await form.getByRole("textbox", { name: "E-mail" }).fill("nao-e-email");
  await form.getByRole("button", { name: "Inscrever" }).click();
  await expect(form.getByText(/Confira o e-mail digitado/)).toBeVisible();

  await form.getByRole("checkbox", { name: /Cuiabá em 5 minutos/ }).uncheck();
  await form.getByRole("textbox", { name: "E-mail" }).fill(`nl-${Date.now()}@exemplo.com`);
  await form.getByRole("button", { name: "Inscrever" }).click();
  await expect(form.getByText(/Escolha ao menos uma newsletter/)).toBeVisible();

  await form.getByRole("checkbox", { name: /Política da semana/ }).check();
  await form.getByRole("button", { name: "Inscrever" }).click();
  await expect(form.getByRole("status")).toContainText("Enviamos um link de confirmação");
});

test("centro de preferências: confirmar, mudar, sair e voltar", async ({ page }) => {
  const email = `prefs-${Date.now()}@exemplo.com`;
  await page.goto("/newsletter");
  const form = page.locator("form").filter({ has: page.getByRole("textbox", { name: "E-mail" }) });
  await form.getByRole("checkbox", { name: /Agenda do fim de semana/ }).check();
  await form.getByRole("textbox", { name: "E-mail" }).fill(email);
  await form.getByRole("button", { name: "Inscrever" }).click();
  await expect(form.getByRole("status")).toContainText("Enviamos um link de confirmação");

  const token = signNewsletterToken("newsletter", email, ["diaria", "agenda-fds"], 3600);
  await page.goto(`/newsletter/preferencias?token=${encodeURIComponent(token)}&confirmar=1`);
  // Abrir o link não confirma (robôs de e-mail abrem links): só o toque no botão (gate P2, I6).
  await expect(page.getByText("Inscrição confirmada. Obrigado!")).toHaveCount(0);
  await expect(
    page.getByRole("checkbox", { name: /Cuiabá em 5 minutos.*Aguardando confirmação/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Confirmar inscrição" }).click();
  await expect(page.getByText("Inscrição confirmada. Obrigado!")).toBeVisible();
  await expect(
    page.getByRole("checkbox", { name: /Cuiabá em 5 minutos.*Recebendo/ }),
  ).toBeChecked();
  await expect(
    page.getByRole("checkbox", { name: /Política da semana.*Não recebe/ }),
  ).not.toBeChecked();

  await page.getByRole("checkbox", { name: /Agenda do fim de semana/ }).uncheck();
  await page.getByRole("button", { name: "Salvar preferências" }).click();
  await expect(page.getByText("Preferências salvas.")).toBeVisible();

  await page.getByRole("button", { name: "Sair de todas" }).click();
  await expect(page.getByText("Você não receberá mais as newsletters do CityNews.")).toBeVisible();
  await page.getByRole("button", { name: "Voltar a receber" }).click();
  await expect(page.getByText("Preferências salvas.")).toBeVisible();

  // Já inscrito e confirmado: a página avisa e manda o link de preferências.
  await page.goto("/newsletter");
  await form.getByRole("textbox", { name: "E-mail" }).fill(email);
  await form.getByRole("button", { name: "Inscrever" }).click();
  await expect(form.getByRole("status")).toContainText("já recebe essas newsletters");
});

test("link expirado ou inválido explica e oferece novo link", async ({ page }) => {
  const expired = signNewsletterToken("newsletter", "a@exemplo.com", ["diaria"], -10);
  await page.goto(`/newsletter/preferencias?token=${encodeURIComponent(expired)}`);
  await expect(page.getByRole("heading", { name: "Este link expirou" })).toBeVisible();
  await page.goto("/newsletter/preferencias?token=abc.def");
  await expect(page.getByRole("heading", { name: "Este link não é válido" })).toBeVisible();
  // Link de alerta não abre as preferências da newsletter (gate P2, M11).
  const alertToken = signNewsletterToken("alert", "a@exemplo.com", ["alert:x"], 3600);
  await page.goto(`/newsletter/preferencias?token=${encodeURIComponent(alertToken)}`);
  await expect(page.getByRole("heading", { name: "Este link não é válido" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Pedir um novo link" })).toHaveAttribute(
    "href",
    "/newsletter",
  );
});

test("newsletter sem violações graves de acessibilidade @a11y", async ({ page }) => {
  await page.goto("/newsletter");
  await page.evaluate(() => document.fonts.ready);
  const r = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(bad, JSON.stringify(bad.map((v) => [v.id, v.nodes.map((n) => n.target)]))).toEqual([]);
});
