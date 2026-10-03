import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { forwardedFor } from "./own-ip";

const EVENT = "/agenda/noite-de-rasqueado-no-sesc-arsenal";

const blocking = (impact: string | null | undefined) =>
  impact === "serious" || impact === "critical";

async function ownIp(page: Page) {
  await page.setExtraHTTPHeaders(forwardedFor());
}

/** Razão de contraste entre a cor do texto e o fundo efetivo (sobe pelos pais até achar fundo). */
async function contrastOf(loc: Locator): Promise<number> {
  return loc.evaluate((el) => {
    const rgba = (css: string) => {
      const c = document.createElement("canvas");
      c.width = c.height = 1;
      const ctx = c.getContext("2d")!;
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = css;
      ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      return [d[0]!, d[1]!, d[2]!, d[3]! / 255] as const;
    };
    const lum = ([r, g, b]: readonly number[]) => {
      const f = (v: number) => {
        const x = v / 255;
        return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(r!) + 0.7152 * f(g!) + 0.0722 * f(b!);
    };
    let bg: readonly number[] = [255, 255, 255, 1];
    for (let n: Element | null = el; n; n = n.parentElement) {
      const c = rgba(getComputedStyle(n).backgroundColor);
      if (c[3] > 0.99) {
        bg = c;
        break;
      }
    }
    const fg = rgba(getComputedStyle(el).color);
    const [a, b] = [lum(fg), lum(bg)];
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  });
}

test("atalhos Hoje, Amanhã, Fim de semana e Grátis vivem na URL e alternam", async ({ page }) => {
  await page.goto("/agenda");
  const shortcuts = page.getByRole("navigation", { name: "Atalhos da agenda" });
  for (const [name, param] of [
    ["Hoje", "quando=hoje"],
    ["Amanhã", "quando=amanha"],
    ["Fim de semana", "quando=fim-de-semana"],
  ] as const) {
    await shortcuts.getByRole("link", { name }).click();
    await expect(page).toHaveURL(new RegExp(param));
    await expect(shortcuts.getByRole("link", { name })).toHaveAttribute("aria-current", "page");
  }
  await shortcuts.getByRole("link", { name: "Grátis" }).click();
  await expect(page).toHaveURL(/gratuito=1/);
  await expect(page).toHaveURL(/quando=fim-de-semana/);
  // O mesmo atalho de novo desliga o filtro.
  await shortcuts.getByRole("link", { name: "Grátis" }).click();
  await expect(page).not.toHaveURL(/gratuito=1/);
  await shortcuts.getByRole("link", { name: "Fim de semana" }).click();
  await expect(page).not.toHaveURL(/quando=/);
});

test("evento em dia agrupado é um card com data, capa, título, local · hora, preço, Salvar e Calendário", async ({
  page,
}) => {
  await page.goto("/agenda");
  const first = page.locator("main article").first();
  await expect(first).toBeVisible();
  await expect(first.locator("time").first()).toBeVisible();
  await expect(first.getByTestId("event-cover")).toBeVisible();
  const title = first.getByRole("heading", { level: 3 });
  await expect(title.getByRole("link")).toHaveAttribute("href", /^\/agenda\//);
  await expect(first).toContainText(/\d{1,2}h(\d{2})? · .+/);
  await expect(first).toContainText(/Gratuito|R\$/);
  await expect(first.getByRole("button", { name: /^Salvar / })).toBeVisible();
  await expect(first.getByRole("link", { name: /calendário/i })).toHaveAttribute(
    "href",
    /^\/api\/ics\//,
  );
  // Cada dia é uma seção com título.
  await expect(page.getByRole("heading", { level: 2, name: /de outubro/ }).first()).toBeVisible();
});

test("Salvar evento guarda neste aparelho e aparece em Favoritos, sem login", async ({ page }) => {
  await page.goto("/agenda");
  const first = page.locator("main article").first();
  const save = first.getByRole("button", { name: /^Salvar / });
  await expect(page.locator("[data-save-event][data-ready=true]").first()).toBeVisible();
  const title = (await first.getByRole("heading", { level: 3 }).innerText()).trim();
  await save.click();
  await expect(save).toHaveAttribute("aria-pressed", "true");
  await page.goto("/favoritos");
  await expect(page.getByRole("link", { name: title, exact: true })).toBeVisible();
});

test("a 360 px os cards cabem e não há rolagem horizontal", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/agenda");
  await expect(page.locator("main article").first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  for (const card of await page.locator("main article").all()) {
    const box = (await card.boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(360);
  }
  // Botões de ação com alvo de 44 px.
  const save = page
    .locator("main article")
    .first()
    .getByRole("button", { name: /^Salvar / });
  expect((await save.boundingBox())!.height).toBeGreaterThanOrEqual(44);
});

test("a 1280 px a lista fica ao lado de um mini-calendário lateral", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/agenda");
  const list = page.locator("main article").first();
  await expect(list).toBeVisible();
  const aside = page.getByRole("complementary", { name: "Calendário do mês" });
  await expect(aside.getByRole("table")).toBeVisible();
  const a = (await aside.boundingBox())!;
  const l = (await list.boundingBox())!;
  expect(a.x).toBeGreaterThan(l.x + l.width - 1);
  expect(Math.abs(a.y - l.y)).toBeLessThan(300);
  // Dia com evento leva à lista daquele dia.
  await aside
    .getByRole("link", { name: /evento/ })
    .first()
    .click();
  await expect(page).toHaveURL(/dia=\d{4}-\d{2}-\d{2}/);
});

test("no celular o mini-calendário lateral não aparece (a lista vem primeiro)", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/agenda");
  await expect(page.getByRole("complementary", { name: "Calendário do mês" })).toBeHidden();
});

test("Lista/Calendário: os dois botões têm contraste ≥ 4,5:1 e o atual é inconfundível", async ({
  page,
}) => {
  await page.goto("/agenda");
  const group = page.getByRole("group", { name: "Visualização" });
  const list = group.getByRole("button", { name: "Lista" });
  const cal = group.getByRole("button", { name: "Calendário" });
  expect(await contrastOf(list)).toBeGreaterThanOrEqual(4.5);
  expect(await contrastOf(cal)).toBeGreaterThanOrEqual(4.5);
  await expect(list).toHaveAttribute("aria-pressed", "true");
  await expect(cal).toHaveAttribute("aria-pressed", "false");
  // O ativo tem fundo escuro; o inativo, texto escuro sobre claro.
  const bg = (l: typeof list) => l.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(await bg(list)).not.toBe(await bg(cal));
});

test("título da agenda é menor que a manchete lead", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/agenda");
  const h1 = await page
    .getByRole("heading", { level: 1 })
    .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(h1).toBeLessThanOrEqual(28);
});

test("filtros da agenda aplicam na hora e ficam na URL", async ({ page }) => {
  await page.goto("/agenda");
  await expect(page.getByRole("button", { name: "Aplicar filtros" })).toHaveCount(0);
  await expect(page.locator("form[data-filter-bar][data-ready=true]")).toBeVisible();
  await page.getByLabel("Categoria").selectOption("musica");
  await expect(page).toHaveURL(/categoria=musica/);
});

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
    page.getByRole("link", { name: "Festival de Siriri e Cururu na Orla", exact: true }),
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
