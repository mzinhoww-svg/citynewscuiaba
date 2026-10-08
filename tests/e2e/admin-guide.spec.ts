import { expect, test } from "@playwright/test";
import { openStudioMenu } from "./helpers/studio-menu";
import { loginAs, service, tag } from "./studio";

/*
 * GUIA-T5 · Admin do Guia: abas Propostas, Listas, Lugares e Modelos; publicar, ajustar, descartar,
 * Patrocinado (só CityNews e parceiros), suspender e reativar; jornalista não entra. Dados próprios
 * por teste (desktop e mobile rodam em paralelo); lugares e listas fictícios apagados no fim.
 */

const CRITERIA =
  "Reunimos hotéis de Cuiabá com dados públicos e ordenamos por nota, ranking e menções. Só entram lugares com duas fontes.";

interface Seed {
  mark: string;
  venueIds: string[];
  proposalTitle: string;
  discardTitle: string;
  listIds: string[];
}

async function seed(): Promise<Seed> {
  const db = service();
  const mark = tag();
  const venueIds: string[] = [];
  for (let n = 1; n <= 5; n += 1) {
    const r = await db
      .from("venues")
      .insert({
        slug: `hotel-e2e-${mark}-${n}`,
        name: `Hotel E2E ${mark} ${n}`,
        category: "hotel",
        neighborhood: "Porto",
        address: `Rua do Teste, ${n}`,
        phone: "+55 65 3000-0000",
        rating: 4.9 - n / 10,
        rating_count: 300,
        rating_source: "tripadvisor",
        tripadvisor_rank: n,
        place_ids: { osm: `node/e2e${mark}${n}`, tripadvisor: `${Date.now()}${n}` },
        data_sources: ["osm", "tripadvisor"],
      })
      .select("id")
      .single();
    expect(r.error).toBeNull();
    venueIds.push(r.data!.id);
  }
  const listIds: string[] = [];
  const mk = async (title: string, slug: string) => {
    const l = await db
      .from("guide_lists")
      .insert({
        slug,
        title,
        category: "hotel",
        criteria: CRITERIA,
        status: "proposal",
        origin: "manual",
      })
      .select("id")
      .single();
    expect(l.error).toBeNull();
    listIds.push(l.data!.id);
    await db.from("guide_list_items").insert(
      venueIds.map((venue_id, i) => ({
        list_id: l.data!.id,
        venue_id,
        position: i + 1,
        score: 80 - i,
        score_breakdown: { rating: 40 - i, rank: 20, mentions: 0, completeness: 15 },
      })),
    );
    await db.from("guide_proposals").insert({
      origin: "manual",
      list_id: l.data!.id,
      analysis: {},
    });
  };
  const proposalTitle = `Os 5 melhores hotéis de teste ${mark}`;
  const discardTitle = `Hotéis para descartar ${mark}`;
  await mk(proposalTitle, `hoteis-e2e-${mark}`);
  await mk(discardTitle, `hoteis-descartar-${mark}`);
  return { mark, venueIds, proposalTitle, discardTitle, listIds };
}

async function cleanup(s: Seed) {
  const db = service();
  await db.from("guide_proposals").delete().in("list_id", s.listIds);
  await db.from("guide_list_items").delete().in("list_id", s.listIds);
  await db.from("guide_lists").delete().in("id", s.listIds);
  await db.from("venues").delete().in("id", s.venueIds);
}

let s: Seed;
test.beforeEach(async () => {
  s = await seed();
});
test.afterEach(async () => {
  await cleanup(s);
});

test("a entrada do admin do Guia abre as Propostas, com abas e estado das fontes", async ({
  page,
}) => {
  await loginAs(page, "marina", "/estudio/admin/guia/propostas");
  await expect(page.getByRole("heading", { level: 1, name: "Guia Cuiabá" })).toBeVisible();
  const tabs = page.getByRole("navigation", { name: "Áreas do Guia" });
  for (const name of ["Propostas", "Listas", "Lugares", "Modelos"])
    await expect(tabs.getByRole("link", { name })).toBeVisible();
  await expect(tabs.getByRole("link", { name: "Propostas" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(page.getByText(/TripAdvisor: (ativo|sem chave)/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Propor por link" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Propor manualmente" })).toBeVisible();
  await page.goto("/estudio/admin/guia");
  await expect(page).toHaveURL(/\/estudio\/admin\/guia\/propostas$/);
});

test("cartão de proposta mostra pontuação por lugar e o Como escolhemos", async ({ page }) => {
  await loginAs(page, "marina", "/estudio/admin/guia/propostas");
  const card = page.getByRole("article", { name: s.proposalTitle });
  await expect(card).toBeVisible();
  await expect(card.getByRole("heading", { name: "Como escolhemos" })).toBeVisible();
  await expect(card.getByText(CRITERIA)).toBeVisible();
  await expect(card.getByText(`Hotel E2E ${s.mark} 1`)).toBeVisible();
  await expect(card.getByText("Pontuação: 80").first()).toBeVisible();
  for (const b of ["Publicar", "Ajustar", "Descartar"])
    await expect(card.getByRole("button", { name: b })).toBeVisible();
});

test("ajustar a lista, publicar e ver na aba Listas", async ({ page }) => {
  await loginAs(page, "marina", "/estudio/admin/guia/propostas");
  const card = page.getByRole("article", { name: s.proposalTitle });
  await card.getByRole("button", { name: "Ajustar" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Título").fill(`Hotéis ajustados ${s.mark}`);
  await dialog.getByRole("button", { name: `Descer: Hotel E2E ${s.mark} 1` }).click();
  await dialog.getByRole("button", { name: "Salvar ajustes" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Lista ajustada." })).toBeVisible();

  const adjusted = page.getByRole("article", { name: `Hotéis ajustados ${s.mark}` });
  await expect(adjusted).toBeVisible();
  await adjusted.getByRole("button", { name: "Publicar" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Lista publicada" })).toBeVisible();
  await expect(adjusted).toHaveCount(0);

  await page.goto("/estudio/admin/guia/listas");
  const row = page.getByRole("row").filter({ hasText: `Hotéis ajustados ${s.mark}` });
  await expect(row).toContainText("Publicada");
  await expect(row).toContainText("Lista editorial (sem patrocínio)");
});

test("publicar sem o Como escolhemos mostra o erro e não publica", async ({ page }) => {
  await service().from("guide_lists").update({ criteria: "" }).eq("id", s.listIds[0]!);
  await loginAs(page, "marina", "/estudio/admin/guia/propostas");
  const card = page.getByRole("article", { name: s.proposalTitle });
  await card.getByRole("button", { name: "Publicar" }).click();
  await expect(page.getByRole("alert").filter({ hasText: /Como escolhemos/ })).toBeVisible();
  const row = await service().from("guide_lists").select("status").eq("id", s.listIds[0]!).single();
  expect(row.data?.status).toBe("proposal");
});

test("descartar exige o motivo", async ({ page }) => {
  await loginAs(page, "marina", "/estudio/admin/guia/propostas");
  const card = page.getByRole("article", { name: s.discardTitle });
  await card.getByRole("button", { name: "Descartar" }).click();
  const dialog = page.getByRole("dialog");
  const confirm = dialog.getByRole("button", { name: "Descartar" });
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel("Motivo").fill("Fora do que queremos agora");
  await confirm.click();
  await expect(page.getByRole("status").filter({ hasText: "Proposta descartada." })).toBeVisible();
  await expect(card).toHaveCount(0);
});

test("Patrocinado: só CityNews e parceiros, com nome, e sem mexer na ordem", async ({ page }) => {
  await service()
    .from("guide_lists")
    .update({ status: "published", published_at: new Date().toISOString() })
    .eq("id", s.listIds[0]!);
  const before = await service()
    .from("guide_list_items")
    .select("venue_id, position")
    .eq("list_id", s.listIds[0]!)
    .order("position");

  await loginAs(page, "marina", "/estudio/admin/guia/listas");
  const row = page.getByRole("row").filter({ hasText: s.proposalTitle });
  await row.getByRole("button", { name: "Patrocínio" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Só do CityNews e de parceiros");
  await dialog.getByLabel("Patrocinado").check();
  await dialog.getByLabel("Quem patrocina").selectOption("partner");
  const save = dialog.getByRole("button", { name: "Salvar patrocínio" });
  await expect(save).toBeDisabled();
  await dialog.getByLabel("Nome do parceiro").fill(`Parceiro ${s.mark}`);
  await save.click();
  await expect(
    page.getByRole("status").filter({ hasText: "Patrocínio atualizado." }),
  ).toBeVisible();
  await expect(row).toContainText(`Patrocinado · Parceiro ${s.mark}`);

  const after = await service()
    .from("guide_list_items")
    .select("venue_id, position")
    .eq("list_id", s.listIds[0]!)
    .order("position");
  expect(after.data).toEqual(before.data);
});

test("suspender e reativar uma lista publicada", async ({ page }) => {
  await service()
    .from("guide_lists")
    .update({ status: "published", published_at: new Date().toISOString() })
    .eq("id", s.listIds[0]!);
  await loginAs(page, "marina", "/estudio/admin/guia/listas");
  const row = page.getByRole("row").filter({ hasText: s.proposalTitle });
  await row.getByRole("button", { name: "Suspender" }).click();
  await page.getByRole("dialog").getByLabel("Motivo").fill("Conferência de endereços");
  await page.getByRole("dialog").getByRole("button", { name: "Suspender" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Lista suspensa." })).toBeVisible();
  await expect(row).toContainText("Suspensa");
  await row.getByRole("button", { name: "Reativar" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Lista reativada." })).toBeVisible();
  await expect(row).toContainText("Publicada");
});

test("Lugares e Modelos: tabelas, lugar novo e catálogo de modelos", async ({ page }) => {
  await loginAs(page, "marina", "/estudio/admin/guia/lugares");
  await expect(page.getByRole("heading", { name: "Reclamações abertas" })).toBeVisible();
  const row = page.getByRole("row").filter({ hasText: `Hotel E2E ${s.mark} 1` });
  await expect(row).toContainText("Cartão tipográfico");
  await expect(row).toContainText("OpenStreetMap, TripAdvisor");
  await page.getByRole("button", { name: "Novo lugar" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nome", { exact: true }).fill(`Pousada Manual ${s.mark}`);
  await dialog.getByRole("button", { name: "Salvar lugar" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Lugar salvo." })).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: `Pousada Manual ${s.mark}` })).toContainText(
    "informações da redação",
  );
  await service().from("venues").delete().like("name", `Pousada Manual ${s.mark}`);

  await page.goto("/estudio/admin/guia/modelos");
  await expect(
    page.getByRole("row").filter({ hasText: "As 5 melhores padarias de Cuiabá" }),
  ).toBeVisible();
  await expect(page.getByRole("row", { name: /Propor agora/ }).first()).toBeVisible();
});

test("jornalista não entra no admin do Guia, e o editor-chefe vê o item no menu", async ({
  page,
}) => {
  await loginAs(page, "juliana");
  await page.goto("/estudio/admin/guia/propostas");
  await expect(page).toHaveURL(/\/entrar\?next=.*motivo=sem-permissao/);
  await page.context().clearCookies();
  await loginAs(page, "marina");
  // A-123: no celular o item do menu fica na gaveta.
  const nav = await openStudioMenu(page);
  await expect(nav.getByRole("link", { name: "Guia Cuiabá" }).first()).toBeVisible();
});
