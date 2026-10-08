import { expect, test } from "@playwright/test";
import { service, tag } from "./studio";

/*
 * GUIA-T6 · Páginas públicas do Guia: índice, lista (texto de abertura e "Atualizada em", sem o
 * quadro "Como escolhemos" desde a A-214), página do lugar ("Dados: ..."), JSON-LD ItemList e LocalBusiness, vocabulário sem IA/revisão, lista
 * suspensa ou rascunho fora do ar. Dados próprios fictícios por execução (apagados no fim). As
 * páginas usam cache por tag: o spec abre cada página só depois de criar os dados.
 */

const FORBIDDEN =
  /\bIA\b|inteligência artificial|gerad[oa] por|revisad[oa] (por|automaticamente)|normalizad/i;
const CRITERIA =
  "Reunimos hotéis de Cuiabá com dados públicos e ordenamos por nota, ranking e menções. Só entram lugares com duas fontes de dados.";

const run = tag();
const slugs = {
  list: `hoteis-publico-${run}`,
  sponsored: `hoteis-patrocinado-${run}`,
  suspended: `hoteis-suspenso-${run}`,
  draft: `hoteis-rascunho-${run}`,
};
const venueIds: string[] = [];
const listIds: string[] = [];

test.beforeAll(async () => {
  const db = service();
  for (let n = 1; n <= 5; n += 1) {
    const v = await db
      .from("venues")
      .insert({
        slug: `hotel-publico-${run}-${n}`,
        name: `Hotel Público ${run} ${n}`,
        category: "hotel",
        neighborhood: "Porto",
        address: `Rua do Teste, ${n}`,
        phone: "+55 65 3000-0000",
        hours: "Mo-Su 00:00-24:00",
        website: `https://hotelpublico${n}${run}.example`,
        price_level: 2,
        rating: 4.9 - n / 10,
        rating_count: 100 * n,
        // O 5º lugar vem do Google (A-210): nota com a fonte e link do Google Maps.
        rating_source: n === 5 ? "google" : "tripadvisor",
        tripadvisor_rank: n === 5 ? null : n,
        tripadvisor_url: n === 5 ? null : `https://www.tripadvisor.com.br/fixture-${run}-${n}`,
        google_maps_url: n === 5 ? `https://maps.google.com/?cid=${n}` : null,
        google_fetched_at: n === 5 ? new Date().toISOString() : null,
        place_ids:
          n === 5
            ? { google: `ChIJ-e2e-${run}`, osm: `node/e2e${run}${n}` }
            : { osm: `node/e2e${run}${n}` },
        data_sources: n === 5 ? ["google", "osm"] : ["osm", "tripadvisor", "site"],
        data_updated_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    expect(v.error).toBeNull();
    venueIds.push(v.data!.id);
  }
  const mk = async (slug: string, status: string, over: Record<string, unknown> = {}) => {
    const now = new Date().toISOString();
    const l = await db
      .from("guide_lists")
      .insert({
        slug,
        title: `Os 5 melhores hotéis ${slug}`,
        category: "hotel",
        criteria: CRITERIA,
        intro: status === "published" ? "Introdução do editor para a lista." : null,
        status,
        origin: "manual",
        published_at: status === "published" || status === "suspended" ? now : null,
        refreshed_at: status === "published" || status === "suspended" ? now : null,
        ...over,
      })
      .select("id")
      .single();
    expect(l.error).toBeNull();
    listIds.push(l.data!.id);
    const items = await db.from("guide_list_items").insert(
      venueIds.map((venue_id, i) => ({
        list_id: l.data!.id,
        venue_id,
        position: i + 1,
        score: 90 - i,
        editor_note: i === 0 ? "Café da manhã elogiado." : null,
      })),
    );
    expect(items.error).toBeNull();
  };
  await mk(slugs.list, "published");
  await mk(slugs.sponsored, "published", {
    sponsored: true,
    sponsor_name: "CityNews",
    sponsor_kind: "citynews",
  });
  await mk(slugs.suspended, "suspended");
  await mk(slugs.draft, "draft");
});

test.afterAll(async () => {
  const db = service();
  await db.from("guide_list_items").delete().in("list_id", listIds);
  await db.from("guide_lists").delete().in("id", listIds);
  await db.from("venues").delete().in("id", venueIds);
  // fullyParallel: o mesmo worker pode rodar o beforeAll de novo depois deste afterAll; ids de
  // linhas já apagadas virariam erro de chave estrangeira no próximo insert.
  venueIds.length = 0;
  listIds.length = 0;
});

test("índice do Guia: título, link das matérias e listas, sem rótulo de IA", async ({ page }) => {
  await page.goto("/guia-cuiaba");
  await expect(page.getByRole("heading", { level: 1, name: "Guia Cuiabá" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Matérias do Guia" })).toHaveAttribute(
    "href",
    "/guia-cuiaba/materias",
  );
  await expect(
    page.getByRole("heading", { name: /Listas do Guia|As primeiras listas/ }),
  ).toBeVisible();
  expect(await page.locator("main").innerText()).not.toMatch(FORBIDDEN);
});

test("lista: texto de abertura, Atualizada em, lugares em ordem e vocabulário limpo, sem quadro de critério", async ({
  page,
}) => {
  await page.goto(`/guia-cuiaba/${slugs.list}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    `Os 5 melhores hotéis ${slugs.list}`,
  );
  // A-214: o quadro "Como escolhemos" saiu do público; o critério segue gravado.
  await expect(page.getByRole("region", { name: "Como escolhemos" })).toHaveCount(0);
  await expect(page.getByText(CRITERIA)).toHaveCount(0);
  await expect(page.getByText(/Atualizada em \d{2}\/\d{2}\/\d{4}/)).toBeVisible();
  await expect(page.getByTestId("guide-article")).toContainText(
    "Introdução do editor para a lista.",
  );

  const cards = page.getByRole("article").filter({ hasText: "º lugar" });
  await expect(cards).toHaveCount(5);
  await expect(cards.first()).toContainText(`Hotel Público ${run} 1`);
  await expect(cards.first()).toContainText("1º lugar");
  await expect(cards.first()).toContainText("Café da manhã elogiado.");
  await expect(cards.first()).toContainText("4,8 no TripAdvisor (100 avaliações)");
  await expect(cards.first()).toContainText("1º no ranking do TripAdvisor em Cuiabá");
  await expect(cards.first().getByTestId("venue-typographic-cover")).toBeVisible();
  await expect(cards.last()).toContainText("5º lugar");
  await expect(page.getByText(/Avaliações e ranking: TripAdvisor/)).toBeVisible();
  await expect(page.getByRole("link", { name: "OpenStreetMap" })).toHaveAttribute(
    "href",
    "https://www.openstreetmap.org/copyright",
  );

  // Sem OriginStrip, sem rótulo de IA ou revisão.
  expect(await page.locator("main").innerText()).not.toMatch(FORBIDDEN);

  // Nenhum rolamento horizontal no 390 nem no 1280.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test("lista: JSON-LD ItemList com a ordem dos lugares", async ({ page }) => {
  await page.goto(`/guia-cuiaba/${slugs.list}`);
  const ld = await page.locator('script[type="application/ld+json"]').allTextContents();
  const list = ld.map((t) => JSON.parse(t)).find((d) => d["@type"] === "ItemList");
  expect(list.numberOfItems).toBe(5);
  expect(list.itemListElement[0].name).toBe(`Hotel Público ${run} 1`);
  expect(list.itemListElement[0].url).toMatch(
    new RegExp(`/guia-cuiaba/lugar/hotel-publico-${run}-1$`),
  );
  expect(list.itemListElement.map((i: { position: number }) => i.position)).toEqual([
    1, 2, 3, 4, 5,
  ]);
});

test("lista patrocinada diz Patrocinado e que a ordem não muda", async ({ page }) => {
  await page.goto(`/guia-cuiaba/${slugs.sponsored}`);
  await expect(page.getByText("Patrocinado · CityNews").first()).toBeVisible();
  await expect(page.getByText(/O patrocínio não altera a ordem da lista/).first()).toBeVisible();
  const cards = page.getByRole("article").filter({ hasText: "º lugar" });
  await expect(cards.first()).toContainText(`Hotel Público ${run} 1`);
});

test("lugar: endereço, telefone, horário, site, nota com fonte, listas e JSON-LD LocalBusiness", async ({
  page,
}) => {
  await page.goto(`/guia-cuiaba/lugar/hotel-publico-${run}-1`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(`Hotel Público ${run} 1`);
  await expect(page.getByText("Rua do Teste, 1")).toBeVisible();
  await expect(page.getByRole("link", { name: "+55 65 3000-0000" })).toHaveAttribute(
    "href",
    "tel:+556530000000",
  );
  await expect(page.getByText("Mo-Su 00:00-24:00")).toBeVisible();
  await expect(page.getByRole("link", { name: "Ver no TripAdvisor" })).toBeVisible();
  await expect(page.getByTestId("venue-typographic-cover")).toBeVisible();
  await expect(
    page.getByText(/Dados: TripAdvisor, OpenStreetMap e sites dos lugares\./),
  ).toBeVisible();
  const lists = page.getByRole("region", { name: "Aparece nestas listas" });
  await expect(
    lists.getByRole("link", { name: `Os 5 melhores hotéis ${slugs.list}` }),
  ).toBeVisible();
  // Lista suspensa e rascunho nunca aparecem como lista do lugar.
  await expect(lists).not.toContainText(slugs.suspended);
  await expect(lists).not.toContainText(slugs.draft);

  const ld = await page.locator('script[type="application/ld+json"]').allTextContents();
  const biz = ld.map((t) => JSON.parse(t)).find((d) => d["@type"] === "Hotel");
  expect(biz.name).toBe(`Hotel Público ${run} 1`);
  expect(biz.address.addressLocality).toBe("Cuiabá");
  expect(biz.openingHours).toEqual(["Mo-Su 00:00-24:00"]);
  expect(biz.aggregateRating).toBeUndefined();
  expect(await page.locator("main").innerText()).not.toMatch(FORBIDDEN);
});

test("lugar do Google: nota com a fonte, link do Google Maps e Dados com Google", async ({
  page,
}) => {
  await page.goto(`/guia-cuiaba/lugar/hotel-publico-${run}-5`);
  await expect(page.getByText("4,4 no Google (500 avaliações)")).toBeVisible();
  await expect(page.getByRole("link", { name: "Ver no Google Maps" })).toHaveAttribute(
    "href",
    "https://maps.google.com/?cid=5",
  );
  await expect(page.getByText(/Dados: Google e OpenStreetMap\./)).toBeVisible();
});

test("lista suspensa, rascunho e slug inexistente respondem 404; /guia-cuiaba/lugar não é lista", async ({
  page,
}) => {
  for (const path of [
    `/guia-cuiaba/${slugs.suspended}`,
    `/guia-cuiaba/${slugs.draft}`,
    "/guia-cuiaba/nao-existe-mesmo",
    "/guia-cuiaba/lugar/nao-existe-mesmo",
    "/guia-cuiaba/lugar",
  ]) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(404);
  }
});

test("matérias do Guia continuam em /guia-cuiaba/materias", async ({ page }) => {
  const res = await page.goto("/guia-cuiaba/materias");
  expect(res?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1, name: "Matérias do Guia" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Guia Cuiabá" }).first()).toBeVisible();
});

test("sitemap de páginas inclui a lista e o lugar publicados", async ({ request }) => {
  const res = await request.get("/sitemap-pages.xml");
  expect(res.status()).toBe(200);
  const xml = await res.text();
  expect(xml).toContain("/guia-cuiaba/materias");
  expect(xml).not.toContain(slugs.draft);
  expect(xml).not.toContain(slugs.suspended);
});
