import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { forwardedFor } from "./own-ip";
import { createArticle, removeArticles, service, tag } from "./studio";

const SLUG = "prefeitura-detalha-novo-plano-de-onibus-cpa-centro";
const CORRECTED = "com-fumaca-escolas-ajustam-horario-de-educacao-fisica";

const blocking = (impact: string | null | undefined) =>
  impact === "serious" || impact === "critical";

/** IP próprio por teste: o limite de 5 envios por hora vale por conexão. */
async function ownIp(page: Page) {
  await page.setExtraHTTPHeaders(forwardedFor());
}

async function report(page: Page) {
  await page.goto(`/materia/${SLUG}`);
  await page.getByRole("button", { name: "Informar problema" }).first().click();
  await page.getByLabel("Informação errada").check();
  await page.getByRole("button", { name: "Enviar" }).click();
}

test("matéria mostra resumo em poucos segundos, fontes e JSON-LD", async ({ page }) => {
  await page.goto(`/materia/${SLUG}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Prefeitura detalha novo plano de ônibus entre CPA e Centro",
  );
  await expect(page.getByRole("heading", { name: "Resumo em poucos segundos" })).toBeVisible();
  await expect(page.getByText(/revisad/i)).toHaveCount(0);
  await expect(page.getByRole("heading", { name: /^Fontes/ })).toBeVisible();
  const sourcesRegion = page.getByRole("region", { name: /^Fontes/ });
  await expect(sourcesRegion.locator("details")).not.toHaveAttribute("open", "");
  await sourcesRegion.locator("summary").click();
  const sources = sourcesRegion.getByRole("link");
  await expect(sources.first()).toBeVisible();
  expect(await sources.count()).toBeGreaterThanOrEqual(3);
  for (const link of await sources.all()) {
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", /noopener/);
  }
  const ld = JSON.parse(
    await page.locator('script[type="application/ld+json"]').first().innerText(),
  );
  expect(ld["@type"]).toBe("NewsArticle");
  expect(ld.dateModified).toBeTruthy();
  expect(ld.citation.length).toBeGreaterThan(0);
  const made = page.getByRole("region", { name: "De onde veio" });
  await expect(made).toBeVisible();
  // Recolhido no celular; aberto de 1024 px em diante.
  if (await made.locator("details:not([open])").count()) await made.locator("summary").click();
  await expect(page.getByRole("link", { name: "Ver histórico de versões" })).toHaveAttribute(
    "href",
    `/materia/${SLUG}/historico`,
  );
  await expect(page.getByRole("complementary", { name: "Atualização" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Semelhantes" })).toBeVisible();
});

/*
 * UI-T6 · matéria como leitura: cabeçalho enxuto, autoria em frase, ações em uma linha.
 */
test("antes do h1 só kicker e status, sem plaqueta nem faixa de rótulos", async ({ page }) => {
  await page.goto(`/materia/${SLUG}`);
  const before = await page.evaluate(() => {
    const h1 = document.querySelector("article h1")!;
    const prev = h1.previousElementSibling as HTMLElement | null;
    return { items: prev ? prev.children.length : 0, text: prev?.textContent ?? "" };
  });
  expect(before.items).toBeLessThanOrEqual(2);
  expect(before.text).not.toMatch(/ORIGINAL CITYNEWS|AGREGADO|Revisad|Feito a partir/);
});

test("autoria diz a origem em frase, sem revisão e sem plaqueta", async ({ page }) => {
  await page.goto(`/materia/${SLUG}`);
  const header = page.locator("article > header");
  await expect(header).toContainText(/Feito a partir de \d+ fontes?/);
  await expect(header).not.toContainText(/revisad|automátic/i);
  await expect(header.locator("[data-origin-label], [data-plaque]")).toHaveCount(0);
});

test("resumo e telas públicas sem rótulo de IA", async ({ page }) => {
  await page.goto(`/materia/${SLUG}`);
  const text = await page.locator("main").innerText();
  expect(text).not.toMatch(
    /\bIA\b|inteligência artificial|normalizado|resumo por IA|gerado por IA/i,
  );
});

const ACTIONS = ["Salvar", "Compartilhar", "Ajustar leitura"];

async function barBox(page: Page) {
  const group = page.getByRole("group", { name: "Ações da matéria" });
  const bar = group.locator("xpath=ancestor::div[contains(@class,'border-y')][1]");
  return { group, bar, box: (await bar.boundingBox())! };
}

for (const width of [1280, 800]) {
  test(`barra de ações em uma linha e mais baixa que o resumo (${width} px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/materia/${SLUG}`);
    const { group, box } = await barBox(page);
    expect(box.height).toBeLessThanOrEqual(56);
    const boxes = [];
    for (const name of ACTIONS)
      boxes.push((await group.getByRole("button", { name }).boundingBox())!);
    expect(
      Math.max(...boxes.map((b) => b.height)) - Math.min(...boxes.map((b) => b.height)),
    ).toBeLessThan(1);
    expect(Math.max(...boxes.map((b) => b.y)) - Math.min(...boxes.map((b) => b.y))).toBeLessThan(2);
    for (const b of boxes) expect(b.height).toBeGreaterThanOrEqual(34);
    const summary = page.getByRole("heading", { name: "Resumo em poucos segundos" });
    const block = (await summary
      .locator("xpath=ancestor::*[self::section or self::div][1]")
      .boundingBox())!;
    expect(box.height).toBeLessThan(block.height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
  });
}

for (const width of [390, 360]) {
  test(`barra de ações em até 2 linhas, sem scroll horizontal (${width} px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto(`/materia/${SLUG}`);
    const { group, box } = await barBox(page);
    expect(box.height).toBeLessThanOrEqual(56 * 2);
    for (const name of ACTIONS) {
      const btn = group.getByRole("button", { name });
      await expect(btn).toBeVisible();
      // alvo de toque de 44 px (padding invisível): o ::before cobre a área.
      const hit = await btn.evaluate((el) => {
        const r = getComputedStyle(el, "::before");
        return [parseFloat(r.width), parseFloat(r.height)];
      });
      expect(hit[0]).toBeGreaterThanOrEqual(44);
      expect(hit[1]).toBeGreaterThanOrEqual(44);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
  });
}

test("depois de salvar, a mensagem fica abaixo dos botões e não quebra a linha (360 px)", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto(`/materia/${SLUG}`);
  const { group } = await barBox(page);
  await group.getByRole("button", { name: "Salvar" }).click();
  const status = page.getByRole("status").filter({ hasText: "Salvo" });
  await expect(status.getByRole("link", { name: "Ver Favoritos" })).toBeVisible();
  const ys = [];
  for (const name of ACTIONS) ys.push((await group.getByRole("button", { name }).boundingBox())!.y);
  expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(2);
  const sy = (await status.boundingBox())!.y;
  expect(sy).toBeGreaterThan(Math.max(...ys));
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
});

test("Informar problema é link discreto fora do grupo de botões", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/materia/${SLUG}`);
  const { group } = await barBox(page);
  await expect(group.getByRole("button", { name: "Informar problema" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Informar problema" }).first()).toBeVisible();
});

test("'De onde veio' vem aberto no desktop já no HTML do servidor (sem JS)", async ({
  browser,
}) => {
  const ctx = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 1280, height: 900 },
  });
  const page = await ctx.newPage();
  await page.goto(`/materia/${SLUG}`);
  await expect(page.getByRole("link", { name: "Ver histórico de versões" })).toBeVisible();
  await ctx.close();
});

test("'De onde veio' abre sozinho no desktop e recolhe no celular", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/materia/${SLUG}`);
  await expect(page.getByRole("link", { name: "Ver histórico de versões" })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto(`/materia/${SLUG}`);
  const summary = page.getByRole("region", { name: "De onde veio" }).locator("summary");
  await expect(page.getByRole("link", { name: "Ver histórico de versões" })).not.toBeVisible();
  await summary.click();
  await expect(page.getByRole("link", { name: "Ver histórico de versões" })).toBeVisible();
});

test("texto no tamanho máximo e modo escuro: sem sobreposição nem rolagem horizontal", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.addInitScript(() => localStorage.setItem("cn_reading_size", "xl"));
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto(`/materia/${SLUG}`);
  await expect(page.locator("html")).toHaveAttribute("data-reading-size", "xl");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  const overlap = await page.evaluate(() => {
    const els = [
      ...document.querySelectorAll<HTMLElement>(
        "article > header > *, article > header [role=group] button",
      ),
    ].filter((e) => e.getBoundingClientRect().height > 0);
    const rects = els
      .filter((e) => !e.contains(els.find((o) => o !== e && e.contains(o)) ?? null))
      .map((e) => e.getBoundingClientRect());
    for (let i = 0; i < rects.length; i++)
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i]!;
        const b = rects[j]!;
        const x = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (x > 1 && y > 1) return true;
      }
    return false;
  });
  expect(overlap).toBe(false);
  // Texto de leitura no escuro com contraste reforçado (7:1).
  const results = await new AxeBuilder({ page })
    .include(".reading-body")
    .withRules(["color-contrast-enhanced"])
    .analyze();
  expect(results.violations).toEqual([]);
});

test("informar problema funciona sem login", async ({ page }) => {
  await ownIp(page);
  await report(page);
  await expect(page.getByRole("dialog").getByRole("status")).toContainText(
    "Resposta da redação em até 24 h",
  );
});

test("informar problema exige o tipo e explica com exemplo", async ({ page }) => {
  await ownIp(page);
  await page.goto(`/materia/${SLUG}`);
  await page.getByRole("button", { name: "Informar problema" }).first().click();
  await page.getByRole("button", { name: "Enviar" }).click();
  await expect(page.getByText(/Escolha o tipo de problema\. Exemplo:/)).toBeVisible();
});

test("6ª denúncia na mesma hora é recusada com mensagem clara", async ({ page }) => {
  test.setTimeout(90_000);
  await ownIp(page);
  for (let i = 0; i < 5; i++) {
    await report(page);
    await expect(page.getByRole("status")).toContainText("Recebemos seu aviso");
  }
  await report(page);
  await expect(page.getByText(/limite de 5 envios por hora/)).toBeVisible();
  await expect(page.getByRole("status")).toHaveCount(0);
});

test.describe("polling com relógio falso", () => {
  // O SW da página (WebKit) responde ao `fetch` do polling e `page.route` não alcança requisições
  // do SW (só o Chromium tem PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS, playwright.config.ts):
  // conforme a hora em que o SW assume a página, a rota falsa é ignorada. Este teste é do
  // polling, não do SW.
  test.use({ serviceWorkers: "block" });

  test("aviso de atualização durante a leitura", async ({ page }) => {
    await page.clock.install();
    await page.route(`**/api/materia/${SLUG}/atualizacao`, (route) =>
      route.fulfill({ json: { updatedAt: "2030-01-01T18:32:00Z" } }),
    );
    await page.goto(`/materia/${SLUG}`);
    await expect(page.locator("[data-polling='on']")).toHaveCount(1);
    await page.clock.fastForward("01:55");
    await expect(page.getByRole("status")).toHaveCount(0);
    await page.clock.fastForward("00:10");
    await expect(page.getByRole("status")).toContainText("Esta matéria foi atualizada às 14h32");
    await expect(
      page.getByRole("status").getByRole("link", { name: "ver o que mudou" }),
    ).toBeVisible();
  });
});

test("rota de atualização responde o updated_at público", async ({ request }) => {
  const ok = await request.get(`/api/materia/${SLUG}/atualizacao`);
  expect((await ok.json()).updatedAt).toMatch(/^2026-09-26/);
  expect((await request.get("/api/materia/materia-arquivada-seed/atualizacao")).status()).toBe(404);
});

test("correção aparece na matéria e no histórico público com diff", async ({ page }) => {
  await page.goto(`/materia/${CORRECTED}`);
  await expect(page.getByRole("complementary", { name: "Correção" })).toContainText(
    "20 minutos, não 18",
  );
  await page.getByRole("link", { name: "Ver o que mudou" }).click();
  await expect(page).toHaveURL(new RegExp(`/materia/${CORRECTED}/historico#v2`));
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Histórico de versões");
  await expect(page.getByRole("heading", { name: /Versão 2 · Correção/ })).toBeVisible();
  await expect(page.locator("ins")).toContainText("20");
  await expect(page.locator("del")).toContainText("18");
  await expect(page.getByText("Primeira versão publicada.")).toBeVisible();
});

test("ajustar leitura muda o tamanho do texto e guarda a escolha", async ({ page }) => {
  await page.goto(`/materia/${SLUG}`);
  await page.getByRole("button", { name: "Ajustar leitura" }).click();
  await page.getByRole("radio", { name: "Maior" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-reading-size", "xl");
  await page.getByRole("button", { name: "Pronto" }).click();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-reading-size", "xl");
});

test("matéria inexistente responde 404 e arquivada mostra o motivo", async ({ page }) => {
  expect((await page.goto("/materia/nao-existe"))!.status()).toBe(404);
  await page.goto("/materia/materia-arquivada-seed");
  await expect(page.getByText(/foi retirada do ar/).first()).toBeVisible();
});

test("sem rolagem horizontal no celular", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto(`/materia/${SLUG}`);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
});

for (const url of [`/materia/${SLUG}`, `/materia/${CORRECTED}/historico`]) {
  test(`sem violações do axe ${url} @a11y`, async ({ page }) => {
    await page.goto(url);
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
}

test("informar problema aberto sem violações do axe @a11y", async ({ page }) => {
  await page.goto(`/materia/${SLUG}`);
  await page.getByRole("button", { name: "Informar problema" }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test("matéria no modo escuro sem violações graves @a11y", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto(`/materia/${SLUG}`);
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.filter((v) => blocking(v.impact)).map((v) => v.id)).toEqual([]);
});

/*
 * UI-T16 · capa e imagem no texto: matéria com dois ativos de fontes diferentes (capa sob o título
 * e figura depois do 3º parágrafo), ambas com "Reprodução web · Fonte", crédito e "Ver original".
 * As imagens são fictícias (a pilha local não tem Storage: o arquivo não carrega, a caixa de
 * proporção fixa continua no lugar).
 */
test.describe("capa e imagem no texto", () => {
  const created: { articles: string[]; media: string[] } = { articles: [], media: [] };
  const para = (text: string) => ({ type: "paragraph", content: [{ type: "text", text }] });

  /** Matéria publicada com capa e imagem no texto; `blockInline` simula remoção a pedido. */
  async function seed(opts: { blockInline?: boolean; cdnCredit?: boolean } = {}) {
    const db = service();
    const t = tag();
    const id = await createArticle({
      title: `Feira de artesanato ocupa a Orla do Porto ${t}`,
      status: "published",
      publish_mode: "human",
      published_at: new Date(Date.now() - 3_600_000).toISOString(),
      body: {
        type: "doc",
        content: [
          para("A feira de artesanato ocupa a Orla do Porto neste fim de semana."),
          para("São 60 bancas de artesãos de Cuiabá e Várzea Grande."),
          para("A entrada é gratuita e a feira abre às 8h."),
          para("O encerramento será às 18h de domingo."),
        ],
      },
    });
    created.articles.push(id);
    const { data: row } = await db.from("articles").select("slug").eq("id", id).single();
    const mk = async (
      origin: string,
      credit: string,
      page: string,
      status = "approved",
      sourceName: string | null = null,
    ) => {
      const mid = crypto.randomUUID();
      const { error } = await db.from("media_assets").insert({
        id: mid,
        kind: "reproduction",
        storage_path: `teste/${mid}.jpg`,
        origin_url: origin,
        page_url: page,
        license: "Reprodução (teste)",
        credit,
        source_name: sourceName,
        allowed_use: `article:${id}`,
        width: 1600,
        height: 900,
        status,
      });
      if (error) throw error;
      created.media.push(mid);
      return mid;
    };
    const cover = await mk(
      opts.cdnCredit
        ? "https://cdn.rdnews.com.br/img/feira.jpg"
        : "https://folhadocerrado.example/img/feira.jpg",
      "Ana Prado",
      opts.cdnCredit ? "https://www.rdnews.com.br/feira" : "https://folhadocerrado.example/feira",
      "approved",
      opts.cdnCredit ? "RDNews" : null,
    );
    const inline = await mk(
      "https://mtagora.example/img/orla.jpg",
      "Rui Lopes",
      "https://mtagora.example/orla",
      opts.blockInline ? "blocked" : "approved",
    );
    const link = await db.from("article_media").insert([
      {
        article_id: id,
        media_id: cover,
        rationale: "teste",
        chosen_by: "pipeline:image",
        alt: "Barracas da feira na Orla",
        role: "cover",
      },
      {
        article_id: id,
        media_id: inline,
        rationale: "teste",
        chosen_by: "pipeline:image",
        alt: "Artesã trabalha na feira",
        role: "inline",
        position: 3,
      },
    ]);
    if (link.error) throw link.error;
    return row!.slug;
  }

  test.afterAll(async () => {
    await removeArticles(created.articles);
    if (created.media.length) await service().from("media_assets").delete().in("id", created.media);
  });

  test("capa sob o título e figura depois do 3º parágrafo, ambas com legenda de reprodução", async ({
    page,
  }) => {
    await page.goto(`/materia/${await seed()}`);
    const figures = page.locator("article figure");
    await expect(figures).toHaveCount(2);

    const cover = figures.nth(0);
    await expect(cover.getByRole("img", { name: "Barracas da feira na Orla" })).toBeAttached();
    await expect(cover.locator("figcaption")).toContainText("Reprodução web · Folha do Cerrado");
    await expect(cover.locator("figcaption")).toContainText("Foto: Ana Prado");
    await expect(cover.getByRole("link", { name: /Ver original/ })).toHaveAttribute(
      "href",
      "https://folhadocerrado.example/feira",
    );
    // A capa vem depois do título e antes do corpo do texto.
    const order = await page.evaluate(() => {
      const h1 = document.querySelector("article h1")!;
      const body = document.querySelector("article .reading-body")!;
      const fig = document.querySelectorAll("article figure")[0]!;
      const follows = (a: Element, b: Element) =>
        !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
      return {
        afterTitle: follows(h1, fig),
        beforeBody: follows(fig, body),
        coverInBody: body.contains(fig),
      };
    });
    expect(order).toEqual({ afterTitle: true, beforeBody: true, coverInBody: false });

    const body = page.locator("article .reading-body");
    const inline = body.locator("figure");
    await expect(inline).toHaveCount(1);
    await expect(inline.getByRole("img", { name: "Artesã trabalha na feira" })).toBeAttached();
    await expect(inline.locator("figcaption")).toContainText("Reprodução web · MT Agora");
    await expect(inline.locator("figcaption")).toContainText("Foto: Rui Lopes");
    await expect(inline.getByRole("link", { name: /Ver original/ })).toHaveAttribute(
      "href",
      "https://mtagora.example/orla",
    );
    // Posição: depois do 3º parágrafo, antes do 4º; nunca antes do lide.
    const kids = await body.locator(":scope > *").evaluateAll((els) => els.map((e) => e.tagName));
    expect(kids).toEqual(["P", "P", "P", "FIGURE", "P"]);
  });

  for (const [width, height] of [
    [1280, 800],
    [800, 900],
    [390, 844],
  ] as const) {
    test(`figura colada à matéria: legenda, espaços e largura da coluna (${width} px)`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height });
      await page.goto(`/materia/${await seed({ cdnCredit: true })}`);
      const fig = page.locator("article figure").first();
      const photo = (await fig.getByRole("img").locator("xpath=..").boundingBox())!;
      const cap = (await fig.locator("figcaption").boundingBox())!;
      const next = (await page.locator("article .reading-body").boundingBox())!;
      const bar = (await page
        .getByRole("group", { name: "Ações da matéria" })
        .locator("xpath=ancestor::div[contains(@class,'border-y')][1]")
        .boundingBox())!;
      // legenda colada: base da foto até o topo da legenda
      expect(cap.y - (photo.y + photo.height)).toBeLessThanOrEqual(16);
      // base da legenda até o próximo bloco; fim da barra de ações até a foto
      if (next.y > cap.y) expect(next.y - (cap.y + cap.height)).toBeLessThanOrEqual(32);
      expect(photo.y - (bar.y + bar.height)).toBeLessThanOrEqual(32);
      // mesma largura da coluna do texto
      const body = (await page.locator("article .reading-body").boundingBox())!;
      expect(Math.abs(photo.width - body.width)).toBeLessThanOrEqual(1);
      expect(Math.abs(photo.x - body.x)).toBeLessThanOrEqual(1);
      // legenda e foto no mesmo <figure>, crédito com o nome do veículo (nunca o host da CDN)
      await expect(fig.locator("figcaption")).toContainText("Reprodução web · RDNews");
      await expect(fig.locator("figcaption")).not.toContainText("cdn.rdnews");
      // foto e título na primeira dobra
      const h1 = (await page.getByRole("heading", { level: 1 }).boundingBox())!;
      expect(h1.y + h1.height).toBeLessThan(height);
      if (width !== 800) expect(photo.y).toBeLessThan(height);
    });
  }

  test("as duas fotos têm proporção fixa (sem salto de layout) e legenda fora da área recortada", async ({
    page,
  }) => {
    await page.goto(`/materia/${await seed()}`);
    for (const i of [0, 1]) {
      const fig = page.locator("article figure").nth(i);
      const box = await fig.getByRole("img").locator("xpath=..").boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width / box!.height).toBeCloseTo(16 / 9, 1);
      const cap = await fig.locator("figcaption").boundingBox();
      expect(cap!.y).toBeGreaterThanOrEqual(box!.y + box!.height - 1);
    }
  });

  test("matéria com as duas imagens sem violações do axe @a11y", async ({ page }) => {
    await page.goto(`/materia/${await seed()}`);
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });

  test("uma das duas removida a pedido: a outra continua na página", async ({ page }) => {
    await page.goto(`/materia/${await seed({ blockInline: true })}`);
    await expect(page.locator("article figure")).toHaveCount(1);
    await expect(page.locator("article figure figcaption")).toContainText("Folha do Cerrado");
  });
});
