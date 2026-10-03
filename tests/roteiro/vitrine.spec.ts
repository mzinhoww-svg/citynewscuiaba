import { test, type Page } from "@playwright/test";
import { loginAs, type Staff } from "../e2e/studio";

/*
 * Vitrine para apresentação ao cliente: captura as telas principais do portal e do Estúdio com os
 * dados fictícios do seed (Folha do Cerrado, MT Agora etc.), em 390 e 1280 de largura, em
 * docs/vitrine/<grupo>-<tela>-<largura>.png. Só com CN_ROTEIRO=1:
 *   CN_ROTEIRO=1 pnpm exec playwright test tests/roteiro/vitrine.spec.ts
 */
test.skip(!process.env.CN_ROTEIRO, "vitrine: rode com CN_ROTEIRO=1");
test.setTimeout(120_000);

const MATERIA = "prefeitura-detalha-novo-plano-de-onibus-cpa-centro";

async function shot(page: Page, group: string, name: string, fullPage = false) {
  const w = page.viewportSize()?.width ?? 0;
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(600);
  await page.screenshot({
    path: `docs/vitrine/${group}-${name}-${w}.png`,
    fullPage,
    animations: "disabled",
  });
}

async function dismissConsent(page: Page) {
  const later = page.getByRole("button", { name: /Agora não|Só o necessário/i }).first();
  if (await later.isVisible().catch(() => false)) await later.click().catch(() => {});
}

const PUBLIC: { name: string; path: string; full?: boolean }[] = [
  { name: "01-home", path: "/" },
  { name: "02-home-completa", path: "/", full: true },
  { name: "03-materia", path: `/materia/${MATERIA}` },
  { name: "04-panorama", path: "/panorama" },
  { name: "05-fontes", path: "/fontes" },
  { name: "06-busca", path: "/busca?q=viaduto" },
  { name: "07-agenda", path: "/agenda" },
  { name: "08-explorar", path: "/explorar" },
  { name: "10-instalar-app", path: "/app" },
  { name: "11-alertas", path: "/alertas" },
  { name: "12-privacidade", path: "/privacidade" },
];

for (const p of PUBLIC) {
  test(`portal · ${p.name}`, async ({ page }) => {
    await page.goto(p.path);
    await page.waitForLoadState("networkidle").catch(() => {});
    await dismissConsent(page);
    await shot(page, "portal", p.name, p.full);
  });
}

test("portal · pergunte (com fontes)", async ({ page }) => {
  await page.goto("/pergunte");
  await page.waitForLoadState("networkidle").catch(() => {});
  await dismissConsent(page);
  const box = page.getByRole("textbox").first();
  if (await box.isVisible().catch(() => false)) {
    await box.fill("O que muda no transporte coletivo do CPA?");
    await box.press("Enter").catch(() => {});
    await page.waitForTimeout(4000);
  }
  await shot(page, "portal", "13-pergunte");
});

const STUDIO: { who: Staff; name: string; path: string }[] = [
  { who: "marina", name: "01-fila-da-redacao", path: "/estudio/fila" },
  { who: "marina", name: "02-calendario", path: "/estudio/calendario" },
  { who: "marina", name: "03-midia", path: "/estudio/midia" },
  { who: "diego", name: "04-control-center", path: "/estudio/control" },
  { who: "diego", name: "05-painel-de-fontes", path: "/estudio/control/fontes" },
  { who: "diego", name: "06-agentes-de-ia", path: "/estudio/control/agentes" },
  { who: "diego", name: "07-custos-de-ia", path: "/estudio/control/custos" },
  { who: "diego", name: "08-recomendacao", path: "/estudio/control/recomendacao" },
  { who: "diego", name: "09-aprovacoes", path: "/estudio/control/aprovacoes" },
  { who: "helena", name: "10-administracao", path: "/estudio/admin" },
  { who: "helena", name: "11-notificacoes", path: "/estudio/admin/notificacoes" },
  { who: "helena", name: "12-funil-do-app", path: "/estudio/admin/notificacoes/funil" },
  { who: "helena", name: "13-home-e-modulos", path: "/estudio/admin/home" },
  { who: "helena", name: "14-auditoria", path: "/estudio/admin/auditoria" },
];

for (const s of STUDIO) {
  test(`estúdio · ${s.name}`, async ({ page }) => {
    await loginAs(page, s.who, s.path);
    await page.waitForLoadState("networkidle").catch(() => {});
    await shot(page, "estudio", s.name);
  });
}
