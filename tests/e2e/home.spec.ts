import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const blocking = (impact: string | null | undefined) =>
  impact === "serious" || impact === "critical";

test("home abre em pt-BR com a manchete como h1", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "pt-BR");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page).toHaveTitle(/CityNews Cuiabá/);
});

test("home: conteúdo CityNews na dobra e agregado abaixo, rotulado", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const agg = page.getByRole("region", { name: "Veja também em outros portais" });
  const box = await agg.boundingBox();
  expect(box!.y).toBeGreaterThan(844);
  await expect(agg.getByText("AGREGADO").first()).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("sem urgente publicado, faixa não aparece", async ({ page }) => {
  // O seed não tem matéria urgente; o caso com urgente é coberto em tests/integration/queries.test.ts
  // e no teste do componente UrgentBar.
  await page.goto("/");
  await expect(page.getByRole("alert", { name: /Urgente/ })).toHaveCount(0);
});

test("home tem os blocos de P01 na ordem", async ({ page }) => {
  await page.goto("/");
  const names = [
    "Agora",
    "Assuntos em destaque",
    "Coleções",
    "Perto de você",
    "Agenda",
    "Serviços",
    "Política",
    "Economia",
    "Cultura",
    "Mais lidas em Cuiabá",
    "Fontes em destaque",
    "Veja também em outros portais",
    "Receba a newsletter",
  ];
  const tops: number[] = [];
  for (const name of names) {
    const region = page.getByRole("region", { name, exact: true });
    await expect(region, name).toHaveCount(1);
    tops.push((await region.boundingBox())!.y);
  }
  // "Agora" fica ao lado da manchete no desktop; os demais seguem a ordem vertical.
  const rest = tops.slice(1);
  expect([...rest].sort((a, b) => a - b)).toEqual(rest);
});

test("todo card mostra de 1 a 4 rótulos de origem", async ({ page }) => {
  await page.goto("/");
  const cards = page.locator("main article:has([data-testid='origin-label'])");
  await expect(cards.first()).toBeVisible();
  expect(await cards.count()).toBeGreaterThan(10);
  for (const card of await cards.all()) {
    const n = await card.getByTestId("origin-label").count();
    expect(n).toBeGreaterThanOrEqual(1);
    expect(n).toBeLessThanOrEqual(4);
  }
});

test("agregados abrem o original em nova aba", async ({ page }) => {
  await page.goto("/");
  const region = page.getByRole("region", { name: "Veja também em outros portais" });
  // A home é transmitida em streaming: espera o bloco existir antes de contar.
  await expect(region).toBeVisible();
  const links = region.locator("article a[target]");
  await expect(links).toHaveCount(4);
  for (const link of await links.all()) {
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", /noopener/);
    await expect(link).toHaveAttribute("rel", /noreferrer/);
    await expect(link).toHaveAttribute("href", /^https:\/\/[a-z.]+\.example\//);
  }
});

test("newsletter valida o e-mail e aceita inscrição sem login", async ({ page }) => {
  // IP próprio por execução: o limite de 5 envios por hora vale por conexão.
  const ip = `203.0.113.${Math.floor(Math.random() * 250) + 1}`;
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `${ip}, 10.0.0.${Date.now() % 250}` });
  await page.goto("/");
  const form = page.getByRole("region", { name: "Receba a newsletter" });
  await form.getByLabel("E-mail").fill("nao-e-email");
  await form.getByRole("button", { name: "Inscrever" }).click();
  await expect(form.getByText(/Confira o e-mail/)).toBeVisible();
  await form.getByLabel("E-mail").fill(`leitora+${Date.now()}@exemplo.com`);
  await form.getByRole("button", { name: "Inscrever" }).click();
  await expect(form.getByRole("status")).toContainText("Inscrição recebida");
});

test("home sem violações do axe @a11y", async ({ page }) => {
  await page.goto("/");
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test("home no modo escuro sem violações serious/critical @a11y", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const results = await new AxeBuilder({ page }).analyze();
  const bad = results.violations.filter((v) => blocking(v.impact));
  expect(bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual(
    [],
  );
});

test("sem rolagem horizontal no celular", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/");
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(360);
});
