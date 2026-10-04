import { expect, test } from "@playwright/test";
import { loginAs } from "../e2e/helpers/studio-login";
import { service, tag } from "../e2e/studio";
import { expectNoSeriousViolations, smallTargets, structureFindings } from "./axe";

/*
 * GUIA-T6 · Acessibilidade (WCAG 2.2 AA, 0 violações serious/critical) do Guia: índice, lista, lugar
 * e matérias, no público; as quatro abas do admin no Estúdio. Temas claro e escuro; 390 e 1280 px
 * vêm dos projetos `mobile` e `desktop`. Dados fictícios próprios, apagados no fim.
 */

const run = tag();
const CRITERIA =
  "Reunimos hotéis de Cuiabá com dados públicos e ordenamos por nota, ranking e menções. Só entram lugares com duas fontes de dados.";
const listSlug = `hoteis-a11y-${run}`;
const sponsoredSlug = `hoteis-a11y-patrocinado-${run}`;
const venueIds: string[] = [];
const listIds: string[] = [];

test.beforeAll(async () => {
  const db = service();
  for (let n = 1; n <= 5; n += 1) {
    const v = await db
      .from("venues")
      .insert({
        slug: `hotel-a11y-${run}-${n}`,
        name: `Hotel A11y ${run} ${n}`,
        category: "hotel",
        neighborhood: "Porto",
        address: `Rua do Teste, ${n}`,
        phone: "+55 65 3000-0000",
        hours: "Mo-Su 00:00-24:00",
        website: `https://hotela11y${n}${run}.example`,
        price_level: 2,
        rating: 4.9 - n / 10,
        rating_count: 100 * n,
        rating_source: "tripadvisor",
        tripadvisor_rank: n,
        tripadvisor_url: `https://www.tripadvisor.com.br/fixture-${run}-${n}`,
        place_ids: { osm: `node/a11y${run}${n}` },
        data_sources: ["osm", "tripadvisor", "site"],
        data_updated_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    expect(v.error).toBeNull();
    venueIds.push(v.data!.id);
  }
  for (const [slug, sponsored] of [
    [listSlug, false],
    [sponsoredSlug, true],
  ] as const) {
    const now = new Date().toISOString();
    const l = await db
      .from("guide_lists")
      .insert({
        slug,
        title: `Os 5 melhores hotéis ${slug}`,
        category: "hotel",
        criteria: CRITERIA,
        status: "published",
        origin: "manual",
        published_at: now,
        refreshed_at: now,
        ...(sponsored
          ? { sponsored: true, sponsor_name: "CityNews", sponsor_kind: "citynews" }
          : {}),
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
      })),
    );
    expect(items.error).toBeNull();
  }
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

const SCHEMES = ["light", "dark"] as const;

for (const scheme of SCHEMES) {
  test.describe(`tema ${scheme}`, () => {
    test.beforeEach(async ({ page, context, baseURL }) => {
      await page.emulateMedia({ colorScheme: scheme });
      // Formato de `parseConsent` (`src/lib/consent`): outro valor conta como sem decisão e o
      // aviso de consentimento cobre a página.
      await context.addCookies([{ name: "cn_consent", value: "v1|m1|p1", url: baseURL! }]);
    });

    for (const path of [
      "/guia-cuiaba",
      `/guia-cuiaba/${listSlug}`,
      `/guia-cuiaba/${sponsoredSlug}`,
      `/guia-cuiaba/lugar/hotel-a11y-${run}-1`,
      "/guia-cuiaba/materias",
    ]) {
      test(`@a11y público ${path.replace(run, "…")}`, async ({ page }) => {
        await page.goto(path);
        await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
        await expectNoSeriousViolations(page);
        expect(await structureFindings(page)).toEqual([]);
        if (scheme === "light") expect(await smallTargets(page)).toEqual([]);
      });
    }

    for (const tab of ["propostas", "listas", "lugares", "modelos"]) {
      test(`@a11y admin ${tab}`, async ({ page }) => {
        await loginAs(page.context(), "marina");
        await page.goto(`/estudio/admin/guia/${tab}`);
        await expect(page.getByRole("heading", { level: 1, name: "Guia Cuiabá" })).toBeVisible();
        await expectNoSeriousViolations(page);
        expect(await structureFindings(page)).toEqual([]);
      });
    }
  });
}
