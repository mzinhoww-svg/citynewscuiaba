import { expect, test, type BrowserContext, type Page } from "@playwright/test";

/*
 * docs/testing.md §2 item 6 · Pergunte ao CityNews (P13) como chat (UI-T13, spec
 * 2026-10-02-ui-publica-design §4.8 e critério 8), com o provedor falso e o seed: pergunta com
 * várias fontes gera resposta com citações; uma só fonte responde atribuída e sem fonte recusa (A-134); tempo esgotado
 * oferece "Tentar de novo"; 21ª pergunta mostra o limite; rede caindo no meio vira falha com
 * "Tentar de novo"; duas perguntas seguidas rápidas viram uma só. Sem JavaScript, o formulário
 * GET (modo simples) continua respondendo no servidor (Review Focus 3).
 * Cada teste usa um IP próprio (x-forwarded-for) para o limite de 20/h não vazar entre testes.
 */
const TIMEOUT_MARKER = "[teste:tempo-esgotado]";
const Q = "O que aconteceu em Cuiabá hoje?";

async function ownIp(context: BrowserContext) {
  const n = () => Math.floor(Math.random() * 250) + 1;
  await context.setExtraHTTPHeaders({ "x-forwarded-for": `10.${n()}.${n()}.${n()}` });
}

test.beforeEach(async ({ context }) => ownIp(context));

const field = (page: Page) => page.getByRole("textbox", { name: "Sua pergunta" });
const reply = (page: Page) => page.getByRole("article", { name: "Resposta do CityNews" });

test("/pergunte?q= abre a conversa com a pergunta enviada, citações e aviso", async ({ page }) => {
  await page.goto(`/pergunte?q=${encodeURIComponent(Q)}`);
  await expect(page.locator("[data-author='person']").getByText(Q)).toBeVisible();
  await expect(reply(page)).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("Resposta pronta.");
  await expect(page.getByText("Pode conter erros. Confira nas fontes.").first()).toBeVisible();
  await expect(field(page)).toHaveValue("");

  // Nenhuma frase factual sem citação.
  const facts = reply(page).getByRole("region", { name: "O que se sabe" }).getByRole("listitem");
  expect(await facts.count()).toBeGreaterThan(0);
  for (const f of await facts.all())
    expect(await f.getByRole("link", { name: /^Fonte \d+$/ }).count()).toBeGreaterThan(0);

  // Citação [1] abre a fonte 1 (sob a bolha no celular, no painel no desktop).
  await reply(page).getByRole("link", { name: "Fonte 1", exact: true }).first().click();
  const active = page.locator("li[aria-current='true']:visible").first();
  await expect(active).toBeVisible();
  await expect(active).toBeInViewport();

  // Fontes de pelo menos dois veículos, com rótulo de origem.
  const items = await page.locator("ol:has(> li[aria-current='true']):visible > li").all();
  expect(items.length).toBeGreaterThanOrEqual(2);
  for (const item of items)
    expect(await item.innerText()).toMatch(/ORIGINAL CITYNEWS|AGREGADO|Feito a partir de/);
});

test("vazio: boas-vindas e 4 perguntas iniciais; tocar uma envia e o foco volta ao campo", async ({
  page,
}) => {
  await page.goto("/pergunte");
  await expect(page.getByRole("heading", { level: 1, name: "Pergunte ao CityNews" })).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  const starters = page.getByRole("list", { name: "Perguntas para começar" }).getByRole("button");
  await expect(starters).toHaveCount(4);
  await page.getByRole("button", { name: Q }).click();
  await expect(field(page)).toBeFocused();
  await expect(reply(page)).toBeVisible();
});

test("Enter envia, Shift+Enter quebra linha, contador a partir de 250", async ({ page }) => {
  await page.goto("/pergunte");
  await field(page).fill("a".repeat(249));
  await expect(page.getByText(/de 300$/)).toHaveCount(0);
  await field(page).fill("a".repeat(320));
  await expect(field(page)).toHaveValue("a".repeat(300));
  await expect(page.getByText("300 de 300")).toBeVisible();
  await field(page).fill("O que se sabe sobre o viaduto");
  await field(page).press("Shift+Enter");
  await expect(field(page)).toHaveValue("O que se sabe sobre o viaduto\n");
  await field(page).press("Enter");
  await expect(field(page)).toHaveValue("");
  await expect(page.locator("[data-author='person']")).toHaveCount(1);
});

test("uma só fonte: a resposta mostra o fato atribuído e uma fonte só (A-134)", async ({
  page,
}) => {
  // A regra (responder com 1 veículo, atribuído) está em src/lib/ai/answer.test.ts; aqui, a tela.
  const answer = {
    kind: "answer",
    confidence: "baixa",
    facts: [
      { text: "Segundo a Agência MT, a vacinação segue nas escolas do Coxipó.", citations: [0] },
    ],
    inferences: [],
    gaps: ["Nenhuma outra fonte confirmou."],
    conflicts: [],
    sources: [
      {
        id: "s1",
        kind: "aggregated",
        title: "Vacinação segue nas escolas do Coxipó",
        url: "https://agencia-mt.example/vacinacao",
        sourceName: "Agência MT",
        publisher: "agencia-mt",
        publishedAt: "2026-10-04T12:00:00Z",
        primary: true,
        sponsored: false,
        label: { kind: "aggregated", text: "AGREGADO", detail: "Agência MT" },
      },
    ],
    asOf: "2026-10-04T13:00:00Z",
  };
  await page.route("**/api/ask", (route) =>
    route.fulfill({
      contentType: "application/x-ndjson; charset=utf-8",
      body: `${JSON.stringify({ type: "status", step: "sources" })}\n${JSON.stringify({ type: "answer", answer, aiOff: false, limit: 20 })}\n`,
    }),
  );
  await page.goto("/pergunte?q=Como está a vacinação no Coxipó?");
  await expect(reply(page)).toHaveCount(1);
  await expect(reply(page).getByText(/Segundo a Agência MT/)).toBeVisible();
  await expect(reply(page).getByText("Nenhuma outra fonte confirmou.")).toBeVisible();
  await expect(
    reply(page).getByRole("link", { name: "Fonte 1", exact: true }).first(),
  ).toBeVisible();
  await expect(reply(page).getByRole("link", { name: "Fonte 2", exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Não encontramos fontes para responder" }),
  ).toHaveCount(0);
});

test("assunto sem fonte: o CityNews explica e oferece a busca tradicional", async ({ page }) => {
  await page.goto("/pergunte?q=Quem venceu o torneio de xadrez de 1987?");
  await expect(
    page.getByRole("heading", { name: "Não encontramos fontes para responder" }),
  ).toBeVisible();
  await expect(page.getByText(/só responde com fonte/)).toBeVisible();
  await expect(reply(page)).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Buscar do jeito tradicional" })).toBeVisible();
});

test("tempo esgotado no provedor oferece Tentar de novo e a busca tradicional", async ({
  page,
}) => {
  await page.goto(`/pergunte?q=${encodeURIComponent(`viaduto ${TIMEOUT_MARKER}`)}`);
  await expect(page.getByRole("heading", { name: "A resposta demorou demais" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Tentar de novo" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Buscar do jeito tradicional" })).toBeVisible();
});

test("21ª pergunta em 1 h mostra o limite e o horário de liberação", async ({ page }) => {
  for (let i = 0; i < 20; i++) {
    const r = await page.request.get("/api/ask?q=x");
    expect(r.status()).toBe(200);
  }
  await page.goto(`/pergunte?q=${encodeURIComponent(Q)}`);
  await expect(
    page.getByRole("heading", { name: "Você atingiu o limite de 20 perguntas por hora" }),
  ).toBeVisible();
  await expect(page.getByText(/O limite libera às/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Buscar do jeito tradicional" })).toBeVisible();
});

test("rede caindo no meio do stream: falha com Tentar de novo, e o campo reaceita", async ({
  page,
}) => {
  let first = true;
  await page.route("**/api/ask", async (route) => {
    if (first) {
      first = false;
      // Só o primeiro evento chega; a conexão termina sem `answer`.
      await route.fulfill({
        status: 200,
        contentType: "application/x-ndjson",
        body: '{"type":"status","step":"sources"}\n',
      });
      return;
    }
    await route.fallback();
  });
  await page.goto("/pergunte");
  await field(page).fill(Q);
  await field(page).press("Enter");
  await expect(
    page.getByRole("heading", { name: "A conexão caiu antes da resposta" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Tentar de novo" }).click();
  await expect(reply(page)).toBeVisible();
  await expect(page.getByRole("button", { name: "Tentar de novo" })).toHaveCount(0);
});

test("duas perguntas seguidas rápidas: a segunda é ignorada enquanto a primeira responde", async ({
  page,
}) => {
  let calls = 0;
  await page.route("**/api/ask", async (route) => {
    calls += 1;
    await route.fallback();
  });
  await page.goto("/pergunte");
  await field(page).fill(Q);
  await field(page).press("Enter");
  await field(page).fill("Segunda pergunta");
  await field(page).press("Enter");
  await expect(reply(page)).toBeVisible();
  await expect(page.locator("[data-author='person']")).toHaveCount(1);
  await expect(field(page)).toHaveValue("Segunda pergunta");
  expect(calls).toBe(1);
});

test("celular: campo fixo na base, acima da barra inferior", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/pergunte");
  const box = await field(page).boundingBox();
  const nav = await page.getByRole("navigation", { name: "Principal" }).last().boundingBox();
  expect(box && nav).toBeTruthy();
  expect(box!.y + box!.height).toBeLessThanOrEqual(nav!.y);
  expect(box!.y).toBeGreaterThan(844 / 2);
});

test("desktop: 3 áreas só com Personalização aceita", async ({ page, context, baseURL }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/pergunte");
  await expect(page.getByRole("complementary", { name: "Fontes da resposta" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Conversas neste aparelho" })).toHaveCount(0);

  await context.addCookies([{ name: "cn_consent", value: "v1|m1|p1", url: baseURL! }]);
  await page.goto(`/pergunte?q=${encodeURIComponent(Q)}`);
  const history = page.getByRole("region", { name: "Conversas neste aparelho" });
  await expect(history).toBeVisible();
  await expect(reply(page)).toBeVisible();
  await expect(history.getByRole("button", { name: new RegExp(Q.slice(0, 20)) })).toBeVisible();
  const conversation = await page
    .getByRole("region", { name: "Conversa com o CityNews" })
    .boundingBox();
  expect(conversation!.width).toBeLessThanOrEqual(720);
});

test("API responde em streaming NDJSON com o contrato da resposta", async ({ page }) => {
  const r = await page.request.post("/api/ask", { data: { q: "O que se sabe sobre o viaduto?" } });
  expect(r.headers()["content-type"]).toContain("application/x-ndjson");
  const lines = (await r.text())
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l));
  expect(lines[0]).toEqual({ type: "status", step: "sources" });
  const last = lines.at(-1);
  expect(last.type).toBe("answer");
  expect(["answer", "insufficient"]).toContain(last.answer.kind);
  expect((await page.request.post("/api/ask", { data: {} })).status()).toBe(400);
});

test.describe("sem JavaScript (Review Focus 3)", () => {
  test.use({ javaScriptEnabled: false });

  // Sem JavaScript o aviso de privacidade não fecha e fica fixo na base; o campo está no fluxo da
  // página, então quem lê rola até ele. O teste faz o mesmo antes de tocar em Enviar.
  const send = async (page: Page) => {
    const button = page.getByRole("button", { name: "Enviar pergunta" });
    await button.evaluate((el) => el.scrollIntoView({ block: "center" }));
    await button.click();
  };

  test("o formulário GET continua respondendo no servidor", async ({ page }) => {
    await page.goto("/pergunte");
    await field(page).fill(Q);
    await send(page);
    await expect(page).toHaveURL(/[?&]modo=simples/);
    await expect(page.getByRole("heading", { name: "Resposta do CityNews" })).toBeVisible();
    await page.getByRole("link", { name: "Fonte 1", exact: true }).first().click();
    await expect(page).toHaveURL(/#fonte-1$/);
  });

  test("pergunta inicial e link ?q= também funcionam", async ({ page }) => {
    await page.goto("/pergunte");
    await page
      .getByRole("list", { name: "Perguntas para começar" })
      .getByRole("button")
      .first()
      .click();
    await expect(page).toHaveURL(/[?&]modo=simples/);
    await expect(page.getByText(/Você perguntou/)).toBeVisible();

    await page.goto(`/pergunte?q=${encodeURIComponent(Q)}`);
    await expect(field(page)).toHaveValue(Q);
    await send(page);
    await expect(page.getByRole("heading", { name: "Resposta do CityNews" })).toBeVisible();
  });
});
