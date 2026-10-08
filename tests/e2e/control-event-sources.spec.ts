import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { serviceClient } from "./helpers/pipeline";
import { loginAs } from "./helpers/studio-login";

/**
 * Fontes de eventos no Painel de Fontes (AGM-T6, spec 2026-10-08 §5.1). Projeto `fixtures`
 * (next dev com CRAWLER_FIXTURES=1 e AI_PROVIDER=fake, sem rede): cadastra a casa fictícia
 * Teatro Cerrado, vê a prévia com evidência (2 eventos e 1 recusa `sem_ano`, página de cartaz sem
 * ano), ativa, coleta agora e confere as abas Coleta e Recusas e a lista filtrada por Eventos.
 * Em série: muda o banco local; o `beforeAll` apaga a fonte de uma execução anterior.
 */
test.describe.configure({ mode: "serial" });

const BASE = "/estudio/control/fontes";
const SITE = "https://teatro-cerrado.example/";
const NAME = "Teatro Cerrado do painel (fictício)";

async function axeClean(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  const bad = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual(
    [],
  );
}

/** Apaga a fonte do teste, os eventos e o cache do site (as suítes de integração contam com isso). */
async function cleanup() {
  const db = serviceClient();
  const old = await db.from("sources").select("id, slug").eq("base_url", SITE).eq("kind", "events");
  for (const s of old.data ?? []) {
    await db.from("event_listings").delete().eq("source_ref", s.id);
    await db.from("event_listings").delete().eq("source_id", s.slug);
    await db.from("sources").delete().eq("id", s.id);
  }
  // Eventos do mesmo site gravados por outra suíte (fontes de fixture) mudariam "novos".
  await db.from("event_listings").delete().like("source_url", "https://teatro-cerrado.example/%");
  await db.from("agenda_extract_cache").delete().like("url", "https://teatro-cerrado.example/%");
}

test.afterAll(cleanup);

test.beforeAll(async ({ request }) => {
  await cleanup();
  // Aquece as rotas no `next dev` (compila na primeira requisição).
  for (const path of [`${BASE}/nova?tipo=eventos`, `${BASE}?tipo=eventos`])
    await request.get(path, { maxRedirects: 0, failOnStatusCode: false }).catch(() => undefined);
});

test("cadastrar fonte de eventos, prévia com evidência, ativar, coletar, Coleta e Recusas", async ({
  page,
  baseURL,
}) => {
  test.setTimeout(180_000);
  await loginAs(page.context(), "helena", baseURL);
  await page.goto(`${BASE}/nova?tipo=eventos`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Nova fonte de eventos" }),
  ).toBeVisible();
  await expect(page.locator("form[data-ready=true]").first()).toBeVisible({ timeout: 30_000 });
  await axeClean(page);

  // Análise: sem API Tribe, JSON-LD, iCal nem RSS → leitura da página com IA.
  await page.getByLabel("Endereço da agenda").fill(SITE);
  await page.getByRole("button", { name: "Analisar" }).click();
  const analysis = page.getByRole("status").filter({ hasText: /leitura da página com IA/ });
  const limit = page.getByRole("alert").filter({ hasText: "muitas análises" });
  await expect(analysis.or(limit)).toBeVisible({ timeout: 30_000 });
  if (await limit.isVisible()) test.skip(true, "cota de análises da hora esgotada (pnpm db:reset)");
  await expect(page.getByLabel("Como os eventos são lidos")).toHaveValue("ai_page");
  await expect(page.getByLabel("Endereço da coleta")).toHaveValue(SITE);

  await page.getByLabel("Nome", { exact: true }).fill(NAME);
  await page.getByLabel("Confirma fatos").check();
  await page.getByRole("button", { name: "Salvar fonte de eventos" }).click();
  await expect(page).toHaveURL(
    /\/estudio\/control\/fontes\/[0-9a-f-]+\/coleta\?cadastro=eventos$/,
    {
      timeout: 60_000,
    },
  );
  const id = /fontes\/([0-9a-f-]+)\//.exec(page.url())![1]!;
  await expect(page.getByRole("heading", { level: 1, name: NAME })).toBeVisible();
  await expect(page.getByText("Fonte de eventos cadastrada, pausada.")).toBeVisible();
  const sections = page.getByRole("navigation", { name: "Seções da fonte" });
  await expect(sections.getByRole("link", { name: "Recusas" })).toBeVisible();
  await expect(sections.getByRole("link", { name: "Recomendação" })).toHaveCount(0);

  // Teste de conexão = prévia: 2 eventos com os trechos e 1 recusa sem ano.
  await page.getByRole("button", { name: "Testar conexão" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Prévia pronta" })).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByRole("status").filter({ hasText: "Prévia pronta" })).toContainText(
    "2 eventos aprovados, 1 recusado",
  );
  const approved = page.getByRole("list", { name: "Eventos aprovados" });
  await expect(approved.getByRole("heading")).toHaveCount(2);
  await expect(approved).toContainText("Forró da Praça");
  await expect(approved).toContainText("Festival Cerrado Eletrônico");
  await expect(approved.getByText("“sábado, 24 de outubro de 2026”")).toBeVisible();
  const rejected = page.getByRole("list", { name: "Recusados nesta prévia" });
  await expect(rejected.getByRole("listitem")).toHaveCount(1);
  await expect(rejected).toContainText("Data sem ano na página");
  await expect(rejected).toContainText("sarau-de-verao");
  await axeClean(page);

  // Ativar: a ação roda a prévia de novo e exige ao menos 1 evento aprovado.
  await page.getByRole("button", { name: "Ativar" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Fonte ativada" })).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByText("Ativa", { exact: true }).first()).toBeVisible();

  // Coletar agora: coleta real só desta fonte; a aba Coleta lista a execução.
  await page.getByRole("button", { name: "Coletar agora" }).last().click();
  const collected = page.getByRole("status").filter({ hasText: "Coleta concluída" });
  await expect(collected).toBeVisible({ timeout: 60_000 });
  await expect(collected).toContainText("2 novos, 0 atualizados, 1 recusado");
  const runs = page.getByRole("table", { name: "Últimas coletas de eventos desta fonte" });
  await expect(runs.getByRole("row")).toHaveCount(2, { timeout: 15_000 });
  await expect(runs.getByRole("row").nth(1)).toContainText("Manual");
  await expect(runs.getByRole("row").nth(1)).toContainText("Ok");

  // Aba Recusas: a página sem ano, com o motivo em texto.
  await sections.getByRole("link", { name: "Recusas" }).click();
  await expect(page).toHaveURL(new RegExp(`${BASE}/${id}/recusas$`));
  const table = page.getByRole("table", { name: "Eventos recusados" });
  await expect(table.getByRole("row")).toHaveCount(2);
  await expect(table).toContainText("Data sem ano na página");
  await expect(table).toContainText("https://teatro-cerrado.example/evento/sarau-de-verao");
  await axeClean(page);

  // Lista com Tipo: Eventos: Confirma fatos e Eventos no ar.
  await page.goto(`${BASE}?tipo=eventos`);
  const row = page.getByRole("row").filter({ hasText: NAME });
  await expect(row).toContainText("Sim");
  await expect(row).toContainText("2 eventos no ar");
  await expect(page.getByRole("columnheader", { name: "Confirma fatos" })).toBeVisible();
  await axeClean(page);
});
