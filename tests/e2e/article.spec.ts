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
  await page.getByRole("button", { name: "Informar problema" }).click();
  await page.getByLabel("Informação errada").check();
  await page.getByRole("button", { name: "Enviar" }).click();
}

test("matéria mostra resumo em poucos segundos, fontes e JSON-LD", async ({ page }) => {
  await page.goto(`/materia/${SLUG}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Prefeitura detalha novo plano de ônibus entre CPA e Centro",
  );
  await expect(page.getByRole("heading", { name: "Resumo em poucos segundos" })).toBeVisible();
  await expect(page.getByText(/Resumo revisado por/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Fontes" })).toBeVisible();
  const sources = page.getByRole("region", { name: "Fontes" }).getByRole("link");
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
  await expect(page.getByRole("region", { name: "Como esta matéria foi feita" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Ver histórico de versões" })).toHaveAttribute(
    "href",
    `/materia/${SLUG}/historico`,
  );
  await expect(page.getByRole("complementary", { name: "Atualização" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Semelhantes" })).toBeVisible();
});

test("informar problema funciona sem login", async ({ page }) => {
  await ownIp(page);
  await report(page);
  await expect(page.getByRole("status")).toContainText("Resposta da redação em até 24 h");
});

test("informar problema exige o tipo e explica com exemplo", async ({ page }) => {
  await ownIp(page);
  await page.goto(`/materia/${SLUG}`);
  await page.getByRole("button", { name: "Informar problema" }).click();
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
  await page.getByRole("button", { name: "Informar problema" }).click();
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
  async function seed(opts: { blockInline?: boolean } = {}) {
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
    const mk = async (origin: string, credit: string, page: string, status = "approved") => {
      const mid = crypto.randomUUID();
      const { error } = await db.from("media_assets").insert({
        id: mid,
        kind: "reproduction",
        storage_path: `teste/${mid}.jpg`,
        origin_url: origin,
        page_url: page,
        license: "Reprodução (teste)",
        credit,
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
      "https://folhadocerrado.example/img/feira.jpg",
      "Ana Prado",
      "https://folhadocerrado.example/feira",
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
    await expect(cover.locator("figcaption")).toContainText(
      "Reprodução web · folhadocerrado.example",
    );
    await expect(cover.locator("figcaption")).toContainText("Foto: Ana Prado");
    await expect(cover.getByRole("link", { name: /Ver original/ })).toHaveAttribute(
      "href",
      "https://folhadocerrado.example/img/feira.jpg",
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
    await expect(inline.locator("figcaption")).toContainText("Reprodução web · mtagora.example");
    await expect(inline.locator("figcaption")).toContainText("Foto: Rui Lopes");
    await expect(inline.getByRole("link", { name: /Ver original/ })).toHaveAttribute(
      "href",
      "https://mtagora.example/img/orla.jpg",
    );
    // Posição: depois do 3º parágrafo, antes do 4º; nunca antes do lide.
    const kids = await body.locator(":scope > *").evaluateAll((els) => els.map((e) => e.tagName));
    expect(kids).toEqual(["P", "P", "P", "FIGURE", "P"]);
  });

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
    await expect(page.locator("article figure figcaption")).toContainText("folhadocerrado.example");
  });
});
