import { expect, test, type BrowserContext } from "@playwright/test";

/*
 * docs/testing.md §2 item 6 · Pergunte ao CityNews (P13) com o provedor falso e o seed:
 * pergunta com várias fontes gera resposta com citações; assunto com uma só fonte gera
 * `insufficient`; tempo esgotado mostra a busca tradicional; 21ª pergunta mostra o limite.
 * Cada teste usa um IP próprio (x-forwarded-for) para o limite de 20/h não vazar entre testes.
 */
const TIMEOUT_MARKER = "[teste:tempo-esgotado]";

async function ownIp(context: BrowserContext) {
  const n = () => Math.floor(Math.random() * 250) + 1;
  await context.setExtraHTTPHeaders({ "x-forwarded-for": `10.${n()}.${n()}.${n()}` });
}

test.beforeEach(async ({ context }) => ownIp(context));

test("resposta com citações clicáveis e aviso", async ({ page }) => {
  await page.goto("/pergunte?q=O que aconteceu em Cuiabá hoje?");
  const live = page.getByTestId("resposta-ia");
  await expect(live).toHaveAttribute("aria-live", "polite");
  await expect(
    page.getByText("RESUMO POR IA").or(page.getByText("Resposta gerada por IA")).first(),
  ).toBeVisible();
  await page.getByRole("link", { name: "Fonte 1", exact: true }).first().click();
  await expect(page).toHaveURL(/#fonte-1$/);
  await expect(page.locator("#fonte-1")).toBeVisible();
  await expect(page.getByText(/Pode conter erros/)).toBeVisible();
  // Nenhuma frase factual sem citação.
  const facts = page
    .getByRole("region", { name: "O que as fontes confirmam" })
    .getByRole("listitem");
  expect(await facts.count()).toBeGreaterThan(0);
  for (const f of await facts.all())
    expect(await f.getByRole("link", { name: /^Fonte \d+$/ }).count()).toBeGreaterThan(0);
  // Fontes de pelo menos dois veículos, com rótulo de origem.
  const rail = page.getByRole("region", { name: "Fontes consultadas" });
  expect(await rail.getByTestId("origin-label").count()).toBeGreaterThanOrEqual(2);
});

test("assunto com uma só fonte não é respondido e sugere caminhos", async ({ page }) => {
  await page.goto("/pergunte?q=Resuma saúde pública no Coxipó");
  await expect(
    page.getByRole("heading", { name: "Não encontramos fontes suficientes para responder" }),
  ).toBeVisible();
  await expect(page.getByText("RESUMO POR IA")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Ver na busca tradicional" })).toBeVisible();
});

test("tempo esgotado no provedor mostra a busca tradicional", async ({ page }) => {
  await page.goto(`/pergunte?q=${encodeURIComponent(`viaduto ${TIMEOUT_MARKER}`)}`);
  await expect(page.getByRole("heading", { name: "A resposta demorou demais" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Tentar de novo" })).toBeVisible();
  const fallback = page.getByRole("region", { name: "Resultados da busca tradicional" });
  await expect(fallback.locator("mark", { hasText: /viaduto/i }).first()).toBeVisible();
});

test("21ª pergunta em 1 h mostra limite", async ({ page }) => {
  for (let i = 0; i < 20; i++) {
    const r = await page.request.get("/api/ask?q=x");
    expect(r.status()).toBe(200);
  }
  await page.goto("/pergunte?q=O que aconteceu em Cuiabá hoje?");
  await expect(
    page.getByRole("heading", { name: "Você atingiu o limite de 20 perguntas por hora" }),
  ).toBeVisible();
  await expect(page.getByText(/O limite libera às/)).toBeVisible();
  await expect(page.getByRole("region", { name: "Resultados da busca tradicional" })).toBeVisible();
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

test("sem pergunta: exemplos e página fora do índice", async ({ page }) => {
  await page.goto("/pergunte");
  await expect(page.getByRole("heading", { level: 1, name: "Pergunte ao CityNews" })).toBeVisible();
  await expect(page.getByRole("link", { name: "O que aconteceu em Cuiabá hoje?" })).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
});
