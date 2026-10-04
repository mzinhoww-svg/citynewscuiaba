import { expect, test } from "@playwright/test";
import { expectNoSeriousViolations } from "../a11y/axe";
import { loginAs, service, tag } from "./studio";

/*
 * ADS-T4 · Publicidade no Estúdio: abas Campos, Banners, Relatório e Patrocinados; pausar uma
 * veiculação; a imagem fora do formato é recusada antes do envio; relatório com CSV; repórter
 * sem acesso. O envio real ao Storage fica no teste de integração (a pilha local não tem Storage).
 */

const BASE = "/estudio/admin/publicidade";

test("A07 · campos, banners, pausa, imagem fora do formato e relatório com CSV", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "desktop", "muda veiculação: só no projeto desktop");
  const mark = tag();
  const db = service();
  const adv = await db
    .from("advertisers")
    .insert({ name: `Ótica ${mark}` })
    .select("id")
    .single();
  if (adv.error) throw adv.error;
  const c = await db
    .from("ad_creatives")
    .insert({
      slot: "RAIL-B",
      name: `Arranha-céu ${mark}`,
      advertiser_id: adv.data.id,
      status: "active",
      creative: {
        kind: "display",
        slot: "RAIL-B",
        width: 300,
        height: 600,
        imageUrl: "https://img.example/otica-300x600.png",
        alt: "Óculos com 20% de desconto",
        href: `https://otica.example/${mark}`,
        weight: 1,
      },
    })
    .select("id")
    .single();
  if (c.error) throw c.error;
  const p = await db
    .from("ad_placements")
    .insert({
      creative_id: c.data.id,
      slot: "RAIL-B",
      starts_on: "2026-01-01",
      ends_on: "2099-12-31",
      status: "active",
    })
    .select("id")
    .single();
  if (p.error) throw p.error;
  const today = new Date(Date.now() - 4 * 3600_000).toISOString().slice(0, 10);
  await db.from("ad_stats").insert({
    day: today,
    placement_id: p.data.id,
    section_slug: "cidade",
    impressions: 40,
    views: 20,
    clicks: 2,
  });

  try {
    await loginAs(page, "marina", BASE);
    const nav = page.getByRole("navigation", { name: "Seções da publicidade" });
    await expect(nav.getByRole("link", { name: "Campos" })).toHaveAttribute("aria-current", "page");
    const rail = page.getByRole("listitem").filter({ hasText: "Arranha-céu lateral" });
    await expect(rail).toContainText("Com anunciante");
    await expectNoSeriousViolations(page);

    await nav.getByRole("link", { name: "Banners" }).click();
    await expect(page).toHaveURL(`${BASE}/banners`);
    const row = page.getByRole("row").filter({ hasText: `Arranha-céu ${mark}` });
    await expect(row).toContainText(`Ótica ${mark}`);
    await expect(row).toContainText("No ar");
    await row.getByRole("button", { name: `Pausar: Arranha-céu ${mark}` }).click();
    await expect(page.getByRole("status")).toContainText("Situação alterada: Pausado.");
    await expect(row).toContainText("Pausado");
    const st = await db.from("ad_placements").select("status").eq("id", p.data.id).single();
    expect(st.data?.status).toBe("paused");

    await page.getByRole("button", { name: "Novo banner" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Campo").selectOption("RAIL-A");
    await dialog
      .getByLabel("Imagem (PNG, JPEG ou WebP, até 200 KB)")
      .setInputFiles("public/ads/newsletter-728x90.png");
    await expect(dialog.getByRole("alert")).toContainText("300×250 px");
    await expect(dialog.getByRole("button", { name: "Cadastrar banner" })).toBeDisabled();
    await expect(dialog.getByLabel("Política")).toHaveCount(0);
    await expect(dialog.getByLabel("Justiça")).toHaveCount(0);
    await dialog
      .getByLabel("Imagem (PNG, JPEG ou WebP, até 200 KB)")
      .setInputFiles("public/ads/newsletter-300x250.png");
    await expect(dialog.getByRole("alert")).toHaveCount(0);
    await expectNoSeriousViolations(page);
    await dialog.getByRole("button", { name: "Cancelar" }).click();

    await nav.getByRole("link", { name: "Relatório" }).click();
    await expect(page.getByRole("table", { name: "Por anunciante" })).toContainText(
      `Ótica ${mark}`,
    );
    await expectNoSeriousViolations(page);
    const href = await page.getByRole("link", { name: "Baixar CSV" }).getAttribute("href");
    expect(href).toContain(`${BASE}/relatorio/csv?de=`);
    const csv = await page.request.get(href!);
    expect(csv.status()).toBe(200);
    const body = await csv.text();
    expect(body.split("\n")[0]).toBe(
      "dia;campo;anunciante;peça;editoria;impressões;visualizações;cliques;ctr",
    );
    expect(body).toContain(
      `${today};RAIL-B;Ótica ${mark};Arranha-céu ${mark};cidade;40;20;2;5,00%`,
    );

    await nav.getByRole("link", { name: "Patrocinados" }).click();
    await expect(page.getByRole("button", { name: "Nova campanha" })).toBeVisible();

    await page.context().clearCookies();
    await loginAs(page, "diego", "/estudio");
    const denied = await page.request.get(`${BASE}/relatorio/csv`);
    expect(denied.status()).toBe(403);
  } finally {
    await db.from("ad_placements").delete().eq("id", p.data.id);
    await db.from("ad_creatives").delete().eq("id", c.data.id);
    await db.from("advertisers").delete().eq("id", adv.data.id);
  }
});
