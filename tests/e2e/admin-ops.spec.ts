import { expect, test } from "@playwright/test";
import { loginAs, service, STAFF, tag } from "./studio";

/*
 * P5-T9 · Administração (A07, A08, A10, A11, A14): auditoria com IP mascarado e CSV para quem
 * não é admin; campanha com selo PATROCINADO e editorias proibidas ausentes; redirecionamento
 * cadastrado leva o endereço antigo ao destino; configurações com grade. Mutações só no desktop.
 */

test("A10 · auditoria: operador vê IPs mascarados e exporta CSV mascarado; admin vê inteiro", async ({
  page,
}) => {
  const mark = tag();
  const db = service();
  const ins = await db.from("audit_log").insert({
    actor: STAFF.diego.id,
    action: "logs.export",
    object_ref: `logs:e2e-${mark}`,
    details: { ip: "200.44.55.66", mark },
  });
  expect(ins.error).toBeNull();

  await loginAs(page, "diego", `/estudio/admin/auditoria?objeto=logs:e2e-${mark}`);
  await expect(page.getByText("IPs mascarados")).toBeVisible();
  const row = page.getByRole("row").filter({ hasText: `logs:e2e-${mark}` });
  await row.getByText("Ver detalhes").click();
  await expect(row).toContainText("200.44.x.x");
  await expect(row).not.toContainText("200.44.55.66");
  const href = await page.getByRole("link", { name: "Exportar CSV" }).getAttribute("href");
  expect(href).toContain("/estudio/admin/auditoria/export?objeto=");
  const csv = await page.request.get(href!);
  expect(csv.status()).toBe(200);
  expect(csv.headers()["content-type"]).toContain("text/csv");
  const body = await csv.text();
  expect(body).toContain("200.44.x.x");
  expect(body).not.toContain("200.44.55.66");

  await page.context().clearCookies();
  await loginAs(page, "helena", `/estudio/admin/auditoria?objeto=logs:e2e-${mark}`);
  await expect(page.getByText("IPs mascarados")).toHaveCount(0);
  const adminRow = page.getByRole("row").filter({ hasText: `logs:e2e-${mark}` });
  await adminRow.getByText("Ver detalhes").click();
  await expect(adminRow).toContainText("200.44.55.66");
});

test("jornalista não entra na auditoria nem na exportação", async ({ page }) => {
  await loginAs(page, "juliana");
  await page.goto("/estudio/admin/auditoria");
  await expect(page).toHaveURL(/\/entrar\?next=.*motivo=sem-permissao/);
  const r = await page.request.get("/estudio/admin/auditoria/export");
  expect(r.status()).toBe(403);
});

test("A07 · campanha com selo PATROCINADO; Política não é opção", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "cria campanha: só no projeto desktop");
  const mark = tag();
  const db = service();
  try {
    await loginAs(page, "marina", "/estudio/admin/publicidade/patrocinados");
    await expect(page.getByText("Rótulo PATROCINADO sempre visível")).toBeVisible();
    await page.getByRole("button", { name: "Nova campanha" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByLabel("Política")).toHaveCount(0);
    await expect(dialog.getByLabel("Segurança")).toHaveCount(0);
    await dialog.getByLabel("Anunciante").fill(`Padaria ${mark}`);
    await dialog.getByLabel("Início").fill("2026-09-01");
    await dialog.getByLabel("Fim").fill("2026-12-31");
    await dialog.getByLabel("Título da peça").fill("Pão quente às 6h");
    await dialog.getByLabel("Link da peça").fill("https://padaria.example/promo");
    await dialog.getByLabel("Cidade").check();
    await expect(dialog.getByTestId("origin-label")).toHaveText(/PATROCINADO/);
    await dialog.getByRole("button", { name: "Salvar campanha" }).click();
    await expect(page.getByRole("status")).toContainText(`Campanha de Padaria ${mark} salva.`);
    await expect(page.getByRole("row").filter({ hasText: `Padaria ${mark}` })).toContainText(
      "Rascunho",
    );
  } finally {
    await db.from("sponsored_campaigns").delete().eq("advertiser", `Padaria ${mark}`);
  }
});

test("A08 · redirecionamento leva o endereço antigo ao destino", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "cria redirecionamento: só no projeto desktop");
  const mark = tag();
  const db = service();
  try {
    await loginAs(page, "marina", "/estudio/admin/seo");
    await expect(page.getByRole("link", { name: "/sitemap-news.xml" })).toBeVisible();
    await page.getByRole("button", { name: "Novo redirecionamento" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Endereço antigo").fill(`/materia/antiga-${mark}`);
    await dialog.getByLabel("Destino").fill("/agenda");
    await dialog.getByRole("button", { name: "Criar" }).click();
    await expect(page.getByRole("status")).toContainText(
      `/materia/antiga-${mark} agora leva para /agenda`,
    );
    const res = await page.goto(`/materia/antiga-${mark}`);
    expect(res?.status()).toBe(200);
    await expect(page).toHaveURL(/\/agenda$/);
  } finally {
    await db.from("redirects").delete().eq("from_path", `/materia/antiga-${mark}`);
  }
});

test("A14 · configuração fora da grade é recusada; dentro, salva com auditoria", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "desktop", "muda configuração global: só no projeto desktop");
  const db = service();
  try {
    await loginAs(page, "helena", "/estudio/admin/configuracoes");
    const field = page.getByLabel("Patrocinados por página (0 a 3)");
    await field.fill("9");
    await page
      .getByRole("button", { name: "Salvar" })
      .nth(await saveIndex(page, "ads.max_per_page"))
      .click();
    await expect(
      page.getByRole("alert").filter({ hasText: "Valor fora da faixa permitida" }),
    ).toBeVisible();
    await field.fill("2");
    await page
      .getByRole("button", { name: "Salvar" })
      .nth(await saveIndex(page, "ads.max_per_page"))
      .click();
    await expect(page.getByRole("status")).toContainText("ads.max_per_page salva.");
    const row = await db
      .from("app_settings")
      .select("value")
      .eq("key", "ads.max_per_page")
      .single();
    expect(row.data?.value).toBe(2);
  } finally {
    await db.from("app_settings").update({ value: 1 }).eq("key", "ads.max_per_page");
  }
});

/** Índice do botão "Salvar" da linha de uma chave (uma linha por chave, na ordem alfabética). */
async function saveIndex(page: import("@playwright/test").Page, key: string) {
  const keys = await page.locator("code").allTextContents();
  return keys.filter((k) => /^[a-z_.]+$/.test(k)).indexOf(key);
}
