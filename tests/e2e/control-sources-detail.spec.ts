import { mkdir } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { loginAs, type StaffKey } from "./helpers/studio-login";

/**
 * Cadastro por link e detalhe da fonte (FS-T8, spec §7.1–§7.5, §8). Roda só no projeto
 * `fixtures` do playwright.config.ts: `next dev` com CRAWLER_FIXTURES=1 e AI_PROVIDER=fake, sem
 * rede. Os testes mudam fontes do seed (Correio Mato-grossense, Agro em Pauta MT, Brasil Hoje,
 * Rádio Pantanal) e por isso rodam em série; `pnpm db:reset` devolve o estado inicial.
 *
 * Isolamento: o projeto `fixtures` declara `dependencies` nos projetos `desktop`/`mobile`
 * (e `mobile-webkit` no CI), então este spec só começa depois que os outros terminaram — os
 * três compartilham o mesmo banco, e uma mutação daqui (arquivar a Rádio Pantanal, mudar a
 * frequência do Correio) não pode aparecer no meio da lista de fontes de outro projeto.
 * Por causa disso, rodar só este arquivo puxa as suítes dos outros projetos antes; para uma
 * rodada local só dele: `pnpm exec playwright test control-sources-detail --no-deps`.
 */
test.describe.configure({ mode: "serial" });

const BASE = "/estudio/control/fontes";
const REPORTS_DIR = "docs/reports/fontes";
const SEED = {
  correio: "c5000000-0000-4000-8000-000000000006", // ativa, RSS
  agro: "c5000000-0000-4000-8000-000000000007", // ativa, imagem "com acordo"
  brasilHoje: "c5000000-0000-4000-8000-000000000012", // ativa
  radioPantanal: "c5000000-0000-4000-8000-000000000005", // pausada (manual)
} as const;
const blocking = (impact: string | null | undefined) =>
  impact === "serious" || impact === "critical";

async function axeClean(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  const bad = results.violations.filter((v) => blocking(v.impact));
  expect(bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual(
    [],
  );
}

async function enter(page: Page, who: StaffKey, baseURL: string | undefined) {
  await loginAs(page.context(), who, baseURL);
}

test("Helena cadastra a Voz do Coxipó a partir do link", async ({ page, baseURL }) => {
  await enter(page, "helena", baseURL);
  await page.goto(`${BASE}/nova`);
  await expect(page.getByRole("heading", { level: 1, name: "Nova fonte" })).toBeVisible();
  const steps = page.getByRole("list", { name: "Etapas do cadastro" });
  await expect(steps.getByRole("listitem").filter({ hasText: "Endereço" })).toHaveAttribute(
    "aria-current",
    "step",
  );
  await page.getByLabel("Endereço da fonte").fill("https://vozdocoxipo.example/");
  await page.getByRole("button", { name: "Analisar" }).click();
  const status = page.getByRole("status");
  await expect(status).toHaveAttribute("aria-live", "polite");
  await expect(status).not.toHaveAttribute("aria-busy", "true", { timeout: 30_000 });
  // Cota de 10 análises por hora por pessoa (spec §10): rodadas repetidas sem `db:reset` esgotam.
  if (await page.getByRole("alert").filter({ hasText: "muitas análises" }).isVisible()) {
    test.skip(true, "cota de análises da hora esgotada (rode pnpm db:reset)");
  }
  // Uma rodada anterior sem `db:reset` já cadastrou a fonte: o fluxo aponta a duplicidade.
  if (await status.getByText(/já está cadastrada/).isVisible()) {
    test.skip(true, "Voz do Coxipó já cadastrada nesta base (rode pnpm db:reset)");
  }
  await expect(status).toContainText("encontrado RSS em /feed");
  await expect(status).toContainText("1 item descartado por conter instruções");
  await expect(
    page.getByRole("list", { name: "Prévia dos últimos itens" }).getByRole("listitem"),
  ).toHaveCount(10);
  await expect(page.locator("ol[aria-label='Prévia dos últimos itens'] img")).toHaveCount(0);
  await expect(page.getByLabel("Política de imagem")).toHaveValue("none");
  await expect(page.getByLabel("Nome", { exact: true })).toHaveValue("Voz do Coxipó");
  await expect(page.getByLabel("Editorias", { exact: true })).toHaveValue("");
  await page.getByRole("button", { name: "Usar sugestão da IA para Editorias" }).click();
  await expect(page.getByLabel("Editorias", { exact: true })).toHaveValue("cidade");
  // Via rápida nunca no cadastro.
  await expect(
    page.getByLabel("Frequência de coleta").locator("option", { hasText: "10 min" }),
  ).toHaveCount(0);

  await mkdir(REPORTS_DIR, { recursive: true });
  await page.screenshot({ path: `${REPORTS_DIR}/nova-1280.png`, fullPage: true });
  await axeClean(page);

  await page.getByLabel("Li os termos de uso e a coleta é permitida").check();
  await page.getByRole("button", { name: "Salvar pausada" }).click();
  await expect(page).toHaveURL(/\/estudio\/control\/fontes\/[0-9a-f-]+\?cadastro=pausada$/);
  await expect(page.getByRole("heading", { level: 1, name: "Voz do Coxipó" })).toBeVisible();
  await expect(page.getByText("Pausada · aguardando ativação")).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Fonte salva pausada" })).toBeVisible();
});

test("frequência: 45 e 25 não são oferecidas; 10 põe na via rápida e a próxima coleta usa janela de 10 min", async ({
  page,
  baseURL,
}) => {
  await enter(page, "helena", baseURL);
  await page.goto(`${BASE}/${SEED.correio}/configuracao`);
  const select = page.getByLabel("Frequência de coleta");
  await expect(select.locator("option", { hasText: /^45 min$/ })).toHaveCount(0);
  await expect(select.locator("option", { hasText: /^25 min$/ })).toHaveCount(0);
  await expect(select.locator("optgroup[label='Via rápida'] option")).toHaveCount(3);
  await expect(
    page.getByText(
      "Abaixo de 30 min a fonte entra na via rápida: coleta a cada 10 min, processamento no ciclo normal.",
    ),
  ).toBeVisible();
  // Primeiro 1 h (ciclo normal), para o teste valer mesmo numa base já alterada por uma rodada anterior.
  await select.selectOption("60");
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(page.getByRole("status")).toContainText("Alterações salvas");
  await select.selectOption("10");
  // Janela de 10 min: minuto terminado em 0.
  await expect(page.getByText(/Próxima coleta prevista: \d{2}:[0-5]0$/)).toBeVisible();
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(page.getByRole("status")).toContainText("Alterações salvas");
  await page.goto(`${BASE}/${SEED.correio}`);
  await expect(page.getByText("10 min · via rápida")).toBeVisible();
  // A Configuração recarregada conta o Correio entre as vagas em uso.
  await page.goto(`${BASE}/${SEED.correio}/configuracao`);
  await expect(page.getByText(/^Via rápida: [1-9]\d* de \d+ vagas em uso\.$/)).toBeVisible();
});

test("fonte pausada vê as opções rápidas desabilitadas com o motivo", async ({ page, baseURL }) => {
  await enter(page, "helena", baseURL);
  await page.goto(`${BASE}/${SEED.radioPantanal}/configuracao`);
  const options = page
    .getByLabel("Frequência de coleta")
    .locator("optgroup[label='Via rápida'] option");
  await expect(options).toHaveCount(3);
  for (const o of await options.all()) await expect(o).toBeDisabled();
  await expect(page.getByText("Ative a fonte antes de colocá-la na via rápida.")).toBeVisible();
});

test("excluir exige digitar o nome e mantém a fonte em Arquivadas; restaurar volta pausada", async ({
  page,
  baseURL,
}) => {
  await enter(page, "helena", baseURL);
  await page.goto(`${BASE}/${SEED.radioPantanal}`);
  await page.getByRole("button", { name: "Excluir fonte" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Excluir Rádio Pantanal?" })).toBeVisible();
  const confirm = dialog.getByRole("button", { name: "Excluir fonte" });
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel("Motivo").fill("Sem atualização há meses");
  await dialog.getByLabel("Digite Rádio Pantanal para confirmar").fill("Radio Pantanal");
  await expect(dialog.getByText("O nome digitado não confere.")).toBeVisible();
  await expect(confirm).toBeDisabled();
  // Esc fecha e devolve o foco ao gatilho.
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("button", { name: "Excluir fonte" })).toBeFocused();

  await page.getByRole("button", { name: "Excluir fonte" }).click();
  await page.getByRole("dialog").getByLabel("Motivo").fill("Sem atualização há meses");
  await page
    .getByRole("dialog")
    .getByLabel("Digite Rádio Pantanal para confirmar")
    .fill("Rádio Pantanal");
  await page.getByRole("dialog").getByRole("button", { name: "Excluir fonte" }).click();
  await expect(page.getByRole("status")).toContainText("Fonte excluída (arquivada)");
  await expect(page.getByText(/^Arquivada em /)).toBeVisible();
  await expect(page.getByRole("button", { name: "Restaurar fonte" })).toBeVisible();

  await page.goto(`${BASE}?status=archived`);
  await expect(page.getByText("Rádio Pantanal").first()).toBeVisible();

  await page.goto(`${BASE}/${SEED.radioPantanal}/configuracao`);
  await expect(page.getByLabel("Nome", { exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Restaurar fonte" }).click();
  await expect(page.getByRole("status")).toContainText("Fonte restaurada");
});

test("mudança de política vira pedido e Marina aprova", async ({ page, browser, baseURL }) => {
  // No projeto `fixtures` (`next dev`) a jornada compila detalhe, configuração e histórico e faz
  // um segundo login: em base fria passa dos 30 s padrão (rodada final de P5-T5/T7).
  test.setTimeout(90_000);
  await enter(page, "diego", baseURL);
  await page.goto(`${BASE}/${SEED.agro}/configuracao`);
  const policy = page.getByLabel("Política de imagem");
  // Restringir aplica na hora, sem justificativa (também deixa o teste repetível numa base já usada).
  await policy.selectOption("none");
  await expect(page.getByLabel("Justificativa para a segunda aprovação")).toHaveCount(0);
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(page.getByRole("status")).toContainText(/Alterações salvas|Nenhuma alteração/);
  await page.reload();
  await expect(policy).toHaveValue("none");
  await policy.selectOption("reproduction");
  await expect(page.getByText("Exige segunda aprovação").first()).toBeVisible();
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Explique por que" })).toBeVisible();
  await page
    .getByLabel("Justificativa para a segunda aprovação")
    .fill("Acordo de reprodução assinado em 27/09");
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(page.getByRole("status")).toContainText("1 alteração aguarda segunda aprovação");
  // O campo volta ao valor gravado até a segunda aprovação.
  await expect(policy).toHaveValue("none");
  await page.reload();
  await expect(
    page.getByText(
      "Aguardando segunda aprovação: política de imagem → reprodução, pedido por Diego Prado",
    ),
  ).toBeVisible();
  // Diego (operador de IA) não aprova.
  await expect(page.getByRole("button", { name: "Revisar" })).toHaveCount(0);

  const ctx = await browser.newContext({ baseURL, locale: "pt-BR", timezoneId: "America/Cuiaba" });
  const marina = await ctx.newPage();
  await loginAs(ctx, "marina", baseURL);
  await marina.goto(`${BASE}/${SEED.agro}`);
  await marina.getByRole("button", { name: "Revisar" }).click();
  const dialog = marina.getByRole("dialog");
  await expect(dialog.getByText("política de imagem: nenhuma imagem → reprodução")).toBeVisible();
  await expect(dialog.getByText("Acordo de reprodução assinado em 27/09")).toBeVisible();
  await expect(dialog.getByText("Diego Prado")).toBeVisible();
  await dialog.getByRole("button", { name: "Aprovar e aplicar" }).click();
  await expect(marina.getByRole("status")).toContainText("Mudança aprovada e aplicada");
  await marina.goto(`${BASE}/${SEED.agro}/configuracao`);
  await expect(marina.getByLabel("Política de imagem")).toHaveValue("reproduction");
  await marina.goto(`${BASE}/${SEED.agro}/historico`);
  await expect(marina.getByRole("cell", { name: "Aprovação aplicada" }).first()).toBeVisible();
  await ctx.close();
});

test("conflito de versão mostra Recarregar", async ({ page, browser, baseURL }) => {
  await enter(page, "helena", baseURL);
  await page.goto(`${BASE}/${SEED.brasilHoje}/configuracao`);
  const ctx = await browser.newContext({ baseURL, locale: "pt-BR", timezoneId: "America/Cuiaba" });
  const other = await ctx.newPage();
  await loginAs(ctx, "diego", baseURL);
  await other.goto(`${BASE}/${SEED.brasilHoje}/configuracao`);
  await other.getByLabel("Nome exibido").fill(`Brasil Hoje (${Date.now()})`);
  await other.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(other.getByRole("status")).toContainText("Alterações salvas");
  await ctx.close();

  await page.getByLabel("Nome exibido").fill("Brasil Hoje BR");
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  const alert = page.getByRole("alert").filter({ hasText: "Esta fonte foi alterada" });
  await expect(alert).toContainText("Esta fonte foi alterada por Diego Prado");
  await expect(alert.getByRole("button", { name: "Recarregar" })).toBeVisible();
});

test("robots que proíbe mostra host e caminho; texto digitado é mantido", async ({
  page,
  baseURL,
}) => {
  await enter(page, "helena", baseURL);
  await page.goto(`${BASE}/nova`);
  await page.getByLabel("Endereço da fonte").fill("https://proibido.example/");
  await page.getByRole("button", { name: "Analisar" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "robots.txt" })).toContainText(
    "O robots.txt de proibido.example não permite a coleta de /. A fonte não pode ser cadastrada para coleta.",
  );
  await expect(page.getByLabel("Endereço da fonte")).toHaveValue("https://proibido.example/");
  await expect(page.getByRole("list", { name: "Prévia dos últimos itens" })).toHaveCount(0);
});

test("id inexistente: 404 amigável", async ({ page, baseURL }) => {
  await enter(page, "helena", baseURL);
  await page.goto(`${BASE}/00000000-0000-4000-8000-000000000000`);
  await expect(page.getByRole("heading", { level: 1, name: "Fonte não encontrada" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Voltar para Fontes" })).toBeVisible();
});

test("aba Coleta: testar conexão sem ingestão e gráfico de saúde com resumo textual @a11y", async ({
  page,
  baseURL,
}) => {
  await enter(page, "helena", baseURL);
  await page.goto(`${BASE}/${SEED.correio}/coleta`);
  await expect(
    page
      .getByRole("navigation", { name: "Seções da fonte" })
      .getByRole("link", { name: "Coleta e teste" }),
  ).toHaveAttribute("aria-current", "page");
  await page.getByRole("button", { name: "Testar conexão" }).click();
  await expect(page.getByRole("status").or(page.getByRole("alert")).first()).toBeVisible();
  await page.goto(`${BASE}/${SEED.correio}`);
  await expect(page.getByRole("figure", { name: "Coletas nos últimos 30 dias" })).toBeVisible();
  await expect(page.locator("figcaption")).toHaveText(
    /^(Nos últimos 30 dias: |Nenhuma coleta registrada nos últimos 30 dias\.)/,
  );
  await mkdir(REPORTS_DIR, { recursive: true });
  await page.screenshot({ path: `${REPORTS_DIR}/detalhe-1280.png`, fullPage: true });
  await axeClean(page);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
});

test("detalhe e configuração em 390 px sem rolagem horizontal @a11y", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await enter(page, "helena", baseURL);
  await page.goto(`${BASE}/${SEED.agro}`);
  await expect(page.getByRole("heading", { level: 1, name: "Agro em Pauta MT" })).toBeVisible();
  await mkdir(REPORTS_DIR, { recursive: true });
  await page.screenshot({ path: `${REPORTS_DIR}/detalhe-390.png`, fullPage: true });
  let overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
  await axeClean(page);

  await page.goto(`${BASE}/${SEED.agro}/configuracao`);
  await expect(page.getByLabel("Frequência de coleta")).toBeVisible();
  await page.screenshot({ path: `${REPORTS_DIR}/configuracao-390.png`, fullPage: true });
  overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
  await axeClean(page);

  await page.goto(`${BASE}/nova`);
  await page.screenshot({ path: `${REPORTS_DIR}/nova-390.png`, fullPage: true });
  await axeClean(page);
});
