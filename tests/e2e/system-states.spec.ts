import { expect, test, type Page } from "@playwright/test";
import { forwardedFor } from "./own-ip";

async function ownIp(page: Page) {
  await page.setExtraHTTPHeaders(forwardedFor());
}

test("matéria arquivada responde 410 com motivo", async ({ page }) => {
  const r = await page.goto("/materia/materia-arquivada-seed");
  expect(r!.status()).toBe(410);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/foi retirada do ar/);
  await expect(page.getByText(/não se confirmou e a matéria foi retirada/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Ver correções" })).toHaveAttribute(
    "href",
    "/correcoes",
  );
  await expect(page.locator('meta[name="robots"]').first()).toHaveAttribute("content", /noindex/);
  await expect(page.getByRole("searchbox")).toBeVisible();
});

test("histórico da matéria arquivada não vira 410", async ({ request }) => {
  const r = await request.get("/materia/materia-arquivada-seed/historico");
  expect(r.status()).not.toBe(410);
});

test("matéria publicada continua 200", async ({ request }) => {
  const r = await request.get("/materia/prefeitura-detalha-novo-plano-de-onibus-cpa-centro");
  expect(r.status()).toBe(200);
});

test("404 oferece busca", async ({ page }) => {
  const r = await page.goto("/materia/nao-existe");
  expect(r!.status()).toBe(404);
  await expect(page.getByRole("searchbox")).toBeVisible();
  await expect(page.getByText(/pode ter sido movida/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Voltar ao início" })).toBeVisible();
});

test("404 de rota desconhecida mantém cabeçalho, busca e rodapé", async ({ page }) => {
  const r = await page.goto("/nao/existe/mesmo");
  expect(r!.status()).toBe(404);
  await expect(page.getByRole("banner")).toBeVisible();
  await expect(page.getByRole("searchbox")).toBeVisible();
  await expect(page.getByRole("contentinfo")).toBeVisible();
});

test("correções públicas listam a do seed", async ({ page }) => {
  await page.goto("/correcoes");
  await expect(page.getByText(/20 minutos, não 18/)).toBeVisible();
  await expect(page.getByRole("link", { name: /Ler a matéria/ }).first()).toHaveAttribute(
    "href",
    /^\/materia\//,
  );
});

const PAGES = [
  ["/sobre", "Sobre o CityNews", true],
  ["/principios-editoriais", "Princípios editoriais", false],
  ["/metodologia", "Metodologia", false],
  ["/como-usamos-ia", "Como usamos IA", false],
  ["/correcoes", "Correções", false],
  ["/direito-de-resposta", "Direito de resposta", false],
  ["/privacidade", "Privacidade", true],
  ["/termos", "Termos de uso", true],
  ["/anuncie", "Anuncie no CityNews", true],
  ["/contato", "Contato", true],
] as const;

for (const [path, title, pending] of PAGES) {
  test(`institucional ${path}`, async ({ page }) => {
    const r = await page.goto(path);
    expect(r!.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
    if (pending) await expect(page.getByText("[PREENCHER]").first()).toBeVisible();
  });
}

test("metodologia explica rótulos e regras em tabela", async ({ page }) => {
  await page.goto("/metodologia");
  await expect(page.getByText("RESUMO POR IA").first()).toBeVisible();
  const table = page.getByRole("table", { name: /Regras de autonomia/ });
  await expect(table.getByRole("rowheader", { name: "Segurança" })).toBeVisible();
  await expect(table.getByRole("row", { name: /Política/ })).toContainText("Sempre revisado");
});

test("direito de resposta sem login: erros por campo e envio", async ({ page }) => {
  await ownIp(page);
  await page.goto("/direito-de-resposta");
  await page.getByRole("button", { name: "Enviar pedido" }).click();
  await expect(page.getByRole("alert").filter({ hasText: /Corrija/ })).toBeVisible();
  await expect(page.getByText(/Informe seu nome/)).toBeVisible();
  await page.getByLabel("Seu nome ou o da organização").fill("Associação de Moradores do CPA");
  await page.getByLabel("E-mail para resposta").fill("contato@associacao.example");
  await page
    .getByLabel("Link da matéria")
    .fill("/materia/o-que-muda-nas-linhas-de-onibus-entre-cpa-e-centro");
  await page
    .getByLabel("Sua resposta")
    .fill("A associação não foi ouvida e discorda do horário de pico informado na matéria.");
  await page.getByLabel(/Autorizo o CityNews/).check();
  await page.getByRole("button", { name: "Enviar pedido" }).click();
  await expect(page.getByRole("status")).toContainText("Recebemos seu pedido");
});

test("página offline estática existe", async ({ request }) => {
  const r = await request.get("/offline.html");
  expect(r.status()).toBe(200);
  // Página própria do SW (spec PWA §7.7): h1 "Sem conexão" e texto "Você está sem internet".
  const html = await r.text();
  expect(html).toContain("<h1>Sem conexão</h1>");
  expect(html).toContain("Você está sem internet");
});
