import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const EVENT = "/agenda/noite-de-rasqueado-no-sesc-arsenal";

const blocking = (impact: string | null | undefined) =>
  impact === "serious" || impact === "critical";

async function ownIp(page: Page) {
  const ip = `192.0.2.${Math.floor(Math.random() * 250) + 1}`;
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `${ip}, 10.1.${Date.now() % 250}.1` });
}

test("lista e calendário mantêm filtro de gratuitos na URL", async ({ page }) => {
  await page.goto("/agenda?gratuito=1");
  await page.getByRole("button", { name: "Calendário" }).click();
  await expect(page).toHaveURL(/view=cal/);
  await expect(page).toHaveURL(/gratuito=1/);
  await expect(page.getByRole("table")).toBeVisible();
  await page.getByRole("button", { name: "Lista" }).click();
  await expect(page).not.toHaveURL(/view=cal/);
  await expect(page).toHaveURL(/gratuito=1/);
});

test("calendário mostra a contagem do dia e leva à lista daquele dia", async ({ page }) => {
  await page.goto("/agenda?view=cal&mes=2026-10");
  await expect(page.getByRole("heading", { name: /outubro de 2026/i })).toBeVisible();
  await page.getByRole("link", { name: /3 de outubro: 1 evento/ }).click();
  await expect(page).toHaveURL(/dia=2026-10-03/);
  await expect(
    page.getByRole("link", { name: "Festival de Siriri e Cururu na Orla" }),
  ).toBeVisible();
  await expect(page.locator("main article")).toHaveCount(1);
});

test("lista agrupa por dia e todo evento gratuito diz isso", async ({ page }) => {
  await page.goto("/agenda?gratuito=1");
  const events = page.locator("main article");
  await expect(events.first()).toBeVisible();
  expect(await events.count()).toBeGreaterThan(0);
  for (const e of await events.all()) await expect(e).toContainText("Gratuito");
  await expect(page.getByRole("heading", { level: 2, name: /de outubro/ }).first()).toBeVisible();
});

test("filtro sem resultado explica e oferece ampliar", async ({ page }) => {
  await page.goto("/agenda?gratuito=1&criancas=1&quando=hoje&categoria=teatro");
  await expect(page.getByText(/Nenhum evento de teatro gratuito para crianças hoje/)).toBeVisible();
  await page.getByRole("link", { name: "Ver próximos 30 dias" }).click();
  await expect(page).not.toHaveURL(/quando=hoje/);
  await expect(page).toHaveURL(/gratuito=1/);
});

test("filtros inválidos são ignorados sem erro", async ({ page }) => {
  const res = await page.goto(
    "/agenda?view=abc&quando=ontem&dia=2026-99-99&mes=x&categoria=%3Cb%3E",
  );
  expect(res!.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("evento mostra dados, JSON-LD e .ics no fuso de Cuiabá", async ({ page, request }) => {
  await page.goto(EVENT);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Noite de rasqueado no Sesc Arsenal",
  );
  await expect(page.getByText(/até 1h30 do dia seguinte/)).toBeVisible();
  await expect(page.getByText(/Informações confirmadas pela organização em/)).toBeVisible();
  const ld = JSON.parse(
    await page.locator('script[type="application/ld+json"]').first().innerText(),
  );
  expect(ld["@type"]).toBe("Event");
  expect(ld.startDate).toBe("2026-10-16T20:00:00-04:00");
  const ics = await request.get("/api/ics/noite-de-rasqueado-no-sesc-arsenal");
  expect(ics.headers()["content-type"]).toContain("text/calendar");
  const body = await ics.text();
  expect(body).toContain("DTSTART;TZID=America/Cuiaba:20261016T200000");
  expect(body).toContain("DTEND;TZID=America/Cuiaba:20261017T013000");
  await expect(page.getByRole("link", { name: "Baixar arquivo .ics" })).toHaveAttribute(
    "href",
    "/api/ics/noite-de-rasqueado-no-sesc-arsenal",
  );
  expect((await request.get("/api/ics/nao-existe")).status()).toBe(404);
});

test("evento inexistente responde 404", async ({ page }) => {
  expect((await page.goto("/agenda/nao-existe"))!.status()).toBe(404);
});

test("sugerir evento sem login", async ({ page }) => {
  await page.goto("/agenda/sugerir");
  await page.getByLabel("Nome do evento").fill("Feira de discos");
  await page.getByRole("button", { name: "Enviar sugestão" }).click();
  await expect(page.getByText(/Informe a data de início/)).toBeVisible();
  await expect(page.getByLabel("Nome do evento")).toHaveValue("Feira de discos");
});

test("sugestão completa entra na fila e o 6º envio na hora é recusado", async ({ page }) => {
  test.setTimeout(90_000);
  await ownIp(page);
  const send = async () => {
    await page.goto("/agenda/sugerir");
    await page.getByLabel("Nome do evento").fill("Feira de discos");
    await page.getByLabel("Data e hora de início").fill("2030-10-10T19:00");
    await page.getByLabel("Local", { exact: true }).fill("Sesc Arsenal");
    await page.getByLabel("Entrada gratuita").check();
    await page.getByLabel("E-mail do responsável").fill("org@exemplo.com");
    await page.getByLabel(/Autorizo o CityNews/).check();
    await page.getByRole("button", { name: "Enviar sugestão" }).click();
  };
  for (let i = 0; i < 5; i++) {
    await send();
    await expect(page.getByRole("status")).toContainText("revisa em até 48 h");
  }
  await send();
  await expect(page.getByText(/limite de 5 envios por hora/)).toBeVisible();
});

test("sem rolagem horizontal no celular", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  for (const url of ["/agenda", "/agenda?view=cal&mes=2026-10", EVENT, "/agenda/sugerir"]) {
    await page.goto(url);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
      url,
    ).toBeLessThanOrEqual(360);
  }
});

for (const url of ["/agenda", "/agenda?view=cal&mes=2026-10", EVENT, "/agenda/sugerir"]) {
  test(`sem violações do axe ${url} @a11y`, async ({ page }) => {
    await page.goto(url);
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
}

test("sugerir com erros sem violações do axe @a11y", async ({ page }) => {
  await page.goto("/agenda/sugerir");
  await page.getByRole("button", { name: "Enviar sugestão" }).click();
  await expect(page.getByText(/Informe a data de início/)).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test("agenda no modo escuro sem violações graves @a11y", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  for (const url of ["/agenda?view=cal&mes=2026-10", EVENT]) {
    await page.goto(url);
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.filter((v) => blocking(v.impact)).map((v) => v.id)).toEqual([]);
  }
});
