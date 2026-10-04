import { mkdir } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { gotoSettled } from "./helpers/nav";
import { cronSecret, drain } from "./helpers/pipeline";
import { loginAs, type StaffKey } from "./helpers/studio-login";
import { createArticle, removeArticles, service, tag } from "./studio";

/*
 * A09 · Fila e aprovações e Histórico (spec 2026-09-28 §10.3, §10.4; critérios 20, 22; PW-T13).
 * Pessoas de verdade em contextos separados. A-128: Marina (push.approve) pede e aprova na mesma
 * ação; o histórico mostra quem pediu e quem aprovou. Otávio (editor) só pede e cancela.
 */
const URL = "/estudio/admin/notificacoes";
const REPORTS_DIR = "docs/reports/pwa";
const blocking = (impact: string | null | undefined) =>
  impact === "serious" || impact === "critical";
const created: string[] = [];

test.afterAll(async () => {
  const db = service();
  if (created.length) {
    await db.from("push_sends").delete().in("article_id", created);
    await removeArticles(created);
  }
  await db.from("rate_limits").delete().like("bucket", "push_admin_%");
});

async function studioPage(browser: Browser, who: StaffKey): Promise<Page> {
  const ctx = await browser.newContext();
  await loginAs(ctx, who);
  return ctx.newPage();
}

async function published(title: string, section = "cidade") {
  const id = await createArticle({
    title,
    section_slug: section,
    status: "published",
    published_at: new Date().toISOString(),
    publish_mode: "human",
    tags: ["chuva"],
    // Não usar "cpa" nem "morada-da-serra": section.spec conta as matérias de Cidade do seed com
    // bairro=cpa e a jornada do PWA segue Morada da Serra; estes testes rodam ao mesmo tempo.
    neighborhoods: ["jardim-italia"],
  });
  created.push(id);
  return id;
}

/** Pede um urgente pela tela de Novo envio (quem tem push.approve já aprova) e devolve o id. */
async function requestUrgentVia(
  page: Page,
  articleTitle: string,
  pushTitle: string,
): Promise<string> {
  await gotoSettled(page, URL);
  await page.getByRole("radio", { name: /^Urgente/ }).check();
  await page.getByRole("combobox", { name: "Matéria" }).fill(articleTitle);
  await page.getByRole("option", { name: new RegExp(articleTitle) }).click();
  await page.getByLabel("Título").fill(pushTitle);
  await page.getByLabel("Justificativa").fill("Alerta da Defesa Civil");
  await page.getByRole("button", { name: "Enviar para aprovação" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Aplicado. O aviso entrou na fila de envio" }),
  ).toBeVisible();
  const { data } = await service().from("push_sends").select("id").eq("title", pushTitle).single();
  return data!.id;
}

test("Marina pede e aprova na mesma ação (A-128); histórico mostra quem pediu e aprovou", async ({
  browser,
  baseURL,
}) => {
  test.slow();
  const t = tag();
  const ART_TITLE = `Chuva forte no CPA ${t}`;
  const PUSH_TITLE = `Chuva forte ${t}`;
  await published(ART_TITLE);
  const marina = await studioPage(browser, "marina");
  try {
    const id = await requestUrgentVia(marina, ART_TITLE, PUSH_TITLE);
    await expect
      .poll(
        async () =>
          (await service().from("push_sends").select("status").eq("id", id).single()).data?.status,
      )
      .toBe("queued");
    const { data: ap } = await service()
      .from("approvals")
      .select("requested_by, approved_by, status")
      .eq("target_ref", `push:${id}`)
      .single();
    expect(ap?.requested_by).toBe(ap?.approved_by);
    await gotoSettled(marina, `${URL}/fila`);
    await expect(
      marina.getByRole("heading", { level: 2, name: "Fila e aprovações" }),
    ).toBeVisible();
    // Já aprovado: nada a revisar.
    await expect(marina.getByRole("button", { name: `Aprovar ${PUSH_TITLE}` })).toHaveCount(0);
    // O despacho (beforeDrain) leva o envio adiante; sem inscrições, termina sem alvos.
    const d = await drain(baseURL!, cronSecret());
    expect(d.status).toBe(200);
    await gotoSettled(marina, `${URL}/historico/${id}`);
    await expect(marina.getByText("Pedido por Marina Arruda")).toBeVisible();
    await expect(marina.getByText(/Aprovado por Marina Arruda às \d{2}:\d{2}/)).toBeVisible();
    await expect(marina.getByRole("list", { name: "Linha do tempo" })).toContainText("Aprovação");
    await expect(
      marina.getByRole("heading", { name: "Por classe de aparelho e navegador" }),
    ).toBeVisible();
  } finally {
    await marina.context().close();
  }
});

test("filtros do histórico ficam na URL; vazio mostra Sem envios no período", async ({ page }) => {
  await loginAs(page.context(), "helena");
  await gotoSettled(page, `${URL}/historico`);
  await page.getByLabel("Período").selectOption("7");
  await page.getByLabel("Tipo").selectOption("highlight");
  await page.getByLabel("Estado").selectOption("expired");
  await page.getByRole("button", { name: "Filtrar" }).click();
  await expect(page).toHaveURL(/periodo=7/);
  await expect(page).toHaveURL(/tipo=highlight/);
  await expect(page).toHaveURL(/estado=expired/);
  await gotoSettled(page, `${URL}/historico?periodo=7&tipo=follow&estado=rejected`);
  await expect(page.getByText("Sem envios no período.")).toBeVisible();
  await expect(page.getByLabel("Período")).toHaveValue("7");
});

test("CSV baixado não tem colunas de inscrição", async ({ page }) => {
  await loginAs(page.context(), "helena");
  await gotoSettled(page, `${URL}/historico?periodo=tudo`);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "Exportar CSV" }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^notificacoes-\d{4}-\d{2}-\d{2}\.csv$/);
  const path = await download.path();
  const text = (await import("node:fs/promises")).readFile(path!, "utf8");
  const csv = await text;
  expect(csv.split(/\r?\n/)[0]).toMatch(
    /^﻿?data;tipo;materia;titulo;publico;pedido_por;aprovado_por;estado;alvos/,
  );
  expect(csv).not.toMatch(/endpoint|p256dh|auth|token|subscription|source:|bairro:/);
});

test("Otávio vê só os próprios pedidos e envios de cidade", async ({ browser }) => {
  test.slow();
  const t = tag();
  const mine = `Vagas no Centro ${t}`;
  const other = `Copa amadora ${t}`;
  await published(mine, "cidade");
  await published(other, "esportes");
  const otavio = await studioPage(browser, "otavio");
  const marina = await studioPage(browser, "marina");
  try {
    // Marina pede um Destaque de esportes (fora das editorias de Otávio).
    await gotoSettled(marina, URL);
    await marina.getByRole("radio", { name: /^Destaque da redação/ }).check();
    await marina.getByRole("combobox", { name: "Matéria" }).fill(other);
    await marina.getByRole("option", { name: new RegExp(other) }).click();
    await marina.getByLabel("Título").fill(`Destaque esportes ${t}`);
    await marina.getByRole("button", { name: "Enviar para aprovação" }).click();
    await expect(marina.getByRole("status").filter({ hasText: "Aplicado." })).toBeVisible();
    // Otávio pede um Destaque de cidade.
    await gotoSettled(otavio, URL);
    await otavio.getByRole("combobox", { name: "Matéria" }).fill(mine);
    await otavio.getByRole("option", { name: new RegExp(mine) }).click();
    await otavio.getByLabel("Título").fill(`Destaque cidade ${t}`);
    await otavio.getByRole("button", { name: "Enviar para aprovação" }).click();
    // A política de avisos decide na hora (A-133): o Destaque da própria editoria entra na fila.
    await expect(otavio.getByRole("status").filter({ hasText: "Aplicado." })).toBeVisible();
    await gotoSettled(otavio, `${URL}/fila`);
    await expect(otavio.getByText(`Destaque cidade ${t}`)).toBeVisible();
    await expect(otavio.getByText(`Destaque esportes ${t}`)).toHaveCount(0);
    // Já na fila: não há o que aprovar; quem pediu pode cancelar.
    await expect(otavio.getByRole("button", { name: `Aprovar Destaque cidade ${t}` })).toHaveCount(
      0,
    );
    await otavio.getByRole("button", { name: `Cancelar Destaque cidade ${t}` }).click();
    await otavio.getByRole("dialog").getByLabel("Motivo do cancelamento").fill("mudou o plano");
    await otavio
      .getByRole("dialog")
      .getByRole("button", { name: "Confirmar cancelamento" })
      .click();
    await expect(otavio.getByRole("status").filter({ hasText: "Envio cancelado" })).toBeVisible();
    // A action revalida o layout e a fila se recarrega; sem esperar o item sair dela, o `goto`
    // seguinte cruza com essa navegação (WebKit: "interrupted by another navigation to /fila").
    await expect(otavio.getByRole("button", { name: `Cancelar Destaque cidade ${t}` })).toHaveCount(
      0,
    );
    await gotoSettled(otavio, `${URL}/historico?periodo=7`);
    await expect(otavio.getByText(`Destaque cidade ${t}`)).toBeVisible();
    await expect(otavio.getByText(`Destaque esportes ${t}`)).toHaveCount(0);
  } finally {
    await otavio.context().close();
    await marina.context().close();
  }
});

test("axe em 390/768/1280 e capturas da fila e do histórico @a11y", async ({ page }) => {
  test.slow();
  await mkdir(REPORTS_DIR, { recursive: true });
  await loginAs(page.context(), "helena");
  for (const [name, width] of [
    ["390", 390],
    ["768", 768],
    ["1280", 1280],
  ] as const) {
    await page.setViewportSize({ width, height: 900 });
    for (const [slug, path] of [
      ["fila", `${URL}/fila`],
      ["historico", `${URL}/historico?periodo=tudo`],
    ] as const) {
      await gotoSettled(page, path);
      await expect(page.getByRole("heading", { level: 1, name: "Notificações" })).toBeVisible();
      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations.filter((v) => blocking(v.impact))).toEqual([]);
      await page.screenshot({ path: `${REPORTS_DIR}/a09-${slug}-${name}.png`, fullPage: true });
    }
  }
});
