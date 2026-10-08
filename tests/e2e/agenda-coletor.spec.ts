import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { service, tag } from "./studio";

const blocking = (impact: string | null | undefined) =>
  impact === "serious" || impact === "critical";

const run = tag();
const slug = `coletado-${run}`;

test.beforeAll(async () => {
  const at = new Date(Date.now() + 40 * 86_400_000).toISOString();
  const { error } = await service()
    .from("event_listings")
    .insert({
      slug,
      title: `Noite do Siriri Moderno ${run}`,
      starts_at: at,
      venue: "Casa Cerrado Vivo",
      neighborhood: "Porto",
      price_unknown: true,
      age_rating: "consulte",
      category: "musica",
      origin: "organizer",
      description:
        "Música em Casa Cerrado Vivo. Consulte o valor e a programação completa no site.",
      source_url: "https://cerradovivo.example/shows/siriri",
      source_id: `e2e-${run}`,
      dedupe_key: `e2e|${run}`,
      confirmed_at: new Date().toISOString(),
    });
  if (error) throw error;
});

test.afterAll(async () => {
  await service().from("event_listings").delete().eq("slug", slug);
});

test("evento coletado mostra link do original e preço 'Consulte o valor no site'", async ({
  page,
}) => {
  await page.goto(`/agenda/${slug}`);
  const link = page.getByRole("link", { name: /Ver no site da organização/ });
  await expect(link).toHaveAttribute("href", "https://cerradovivo.example/shows/siriri");
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(page.getByText("Consulte o valor no site")).toBeVisible();
  await expect(page.getByText("Gratuito")).toHaveCount(0);
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations.filter((v) => blocking(v.impact))).toEqual([]);
});

/** Origem e confirmação (AGM-T8): fontes e eventos de um mesmo dia, criados só para este teste. */
test.describe("origem e confirmação do evento", () => {
  const day = new Date(Date.now() + 25 * 86_400_000).toISOString().slice(0, 10);
  const ids = {
    discovery: crypto.randomUUID(),
    house: crypto.randomUUID(),
  };
  const slugs = {
    unconfirmed: `agm8-solto-${run}`,
    confirmed: `agm8-confirmado-${run}`,
    own: `agm8-casa-${run}`,
    newsroom: `agm8-redacao-${run}`,
  };
  const names = { discovery: `Agenda Exemplo ${run}`, house: `Casa Exemplo ${run}` };

  test.beforeAll(async () => {
    const db = service();
    const src = (id: string, slug: string, name: string, confirms: boolean) => ({
      id,
      slug,
      name,
      base_url: `https://${slug}.example`,
      kind: "events" as const,
      locality: "cuiaba",
      status: "paused" as const,
      confirms,
      extract_kind: "jsonld" as const,
      event_origin: "organizer" as const,
    });
    const s = await db
      .from("sources")
      .insert([
        src(ids.discovery, `agm8-d-${run}`, names.discovery, false),
        src(ids.house, `agm8-h-${run}`, names.house, true),
      ]);
    if (s.error) throw s.error;
    const ev = (slug: string, hour: string, extra: Record<string, string | null>) => ({
      slug,
      title: `Evento ${slug}`,
      starts_at: `${day}T${hour}:00:00Z`,
      venue: "Local Exemplo",
      price_cents: 0,
      age_rating: "livre",
      category: "musica",
      origin: "organizer" as "organizer" | "newsroom",
      source_id: `e2e-${slug}`,
      dedupe_key: `e2e|${slug}`,
      confirmed_at: new Date().toISOString(),
      ...extra,
    });
    const r = await db
      .from("event_listings")
      .insert([
        ev(slugs.unconfirmed, "14", { source_ref: ids.discovery }),
        ev(slugs.confirmed, "18", { source_ref: ids.discovery, confirmed_by_source_id: ids.house }),
        ev(slugs.own, "19", { source_ref: ids.house }),
        ev(slugs.newsroom, "20", { origin: "newsroom", source_ref: null }),
      ]);
    if (r.error) throw r.error;
  });

  test.afterAll(async () => {
    const db = service();
    await db.from("event_listings").delete().in("slug", Object.values(slugs));
    await db.from("sources").delete().in("id", Object.values(ids));
  });

  test("na lista, o confirmado vem antes do não confirmado do mesmo dia", async ({ page }) => {
    await page.goto(`/agenda?dia=${day}`);
    const titles = await page.locator("main article h3").allInnerTexts();
    const at = (slug: string) => titles.findIndex((t) => t.includes(slug));
    expect(at(slugs.confirmed)).toBeGreaterThanOrEqual(0);
    expect(at(slugs.unconfirmed)).toBeGreaterThan(at(slugs.confirmed));
    expect(at(slugs.unconfirmed)).toBeGreaterThan(at(slugs.own));
    expect(at(slugs.unconfirmed)).toBeGreaterThan(at(slugs.newsroom));
    const card = page.locator("main article").filter({ hasText: slugs.confirmed });
    await expect(card).toContainText(`Com informações de ${names.discovery}`);
    await expect(card).toContainText(`Confirmado por ${names.house}`);
    const loose = page.locator("main article").filter({ hasText: slugs.unconfirmed });
    await expect(loose).toContainText(`Com informações de ${names.discovery}`);
    await expect(loose).toContainText("Confirme na fonte");
  });

  test("a página do evento diz a origem, a confirmação e passa no axe", async ({ page }) => {
    await page.goto(`/agenda/${slugs.confirmed}`);
    const note = page.getByTestId("event-origin");
    await expect(note).toContainText(`Com informações de ${names.discovery}`);
    await expect(note).toContainText(`Confirmado por ${names.house}`);
    await expect(note).not.toContainText("confirmadas pela organização");
    await page.goto(`/agenda/${slugs.unconfirmed}`);
    await expect(page.getByTestId("event-origin")).toContainText("Confirme na fonte");
    await expect(page.getByTestId("event-origin")).not.toContainText(
      "confirmadas pela organização",
    );
    await page.goto(`/agenda/${slugs.own}`);
    const own = page.getByTestId("event-origin");
    await expect(own).toContainText(`Com informações de ${names.house}`);
    await expect(own).not.toContainText("Confirmado por");
    await expect(own).not.toContainText("Confirme na fonte");
    await page.goto(`/agenda/${slugs.newsroom}`);
    await expect(page.getByTestId("event-origin")).toContainText("Origem da informação: CityNews.");
    await expect(page.getByTestId("event-origin")).not.toContainText("Com informações de");
    await expect(page.getByTestId("event-origin")).not.toContainText(
      "confirmadas pela organização",
    );
    const { violations } = await new AxeBuilder({ page }).analyze();
    expect(violations.filter((v) => blocking(v.impact))).toEqual([]);
  });

  test("vocabulário proibido não aparece na agenda nem no evento", async ({ page }) => {
    for (const url of [`/agenda?dia=${day}`, `/agenda/${slugs.confirmed}`]) {
      await page.goto(url);
      const text = await page.locator("main").innerText();
      expect(text).not.toMatch(/\bIA\b|inteligência artificial|gerad[oa]|normalizad/i);
    }
  });

  test("filtro de origem CityNews lista só eventos da redação", async ({ page }) => {
    await page.goto(`/agenda?dia=${day}&origem=citynews`);
    await expect(page.locator("main article").filter({ hasText: slugs.newsroom })).toHaveCount(1);
    await expect(page.locator("main article").filter({ hasText: slugs.confirmed })).toHaveCount(0);
  });
});

test("a Agenda nunca fica vazia: eventos ou datas recorrentes, sem violações", async ({ page }) => {
  await page.goto("/agenda");
  const events = page.locator("article").filter({ has: page.getByRole("link") });
  const recurring = page.getByRole("region", { name: "Datas e eventos recorrentes de Cuiabá" });
  await expect(events.first().or(recurring)).toBeVisible();
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations.filter((v) => blocking(v.impact))).toEqual([]);
});

test("home: o módulo de Agenda sempre tem conteúdo", async ({ page }) => {
  await page.goto("/");
  const agenda = page.getByRole("region", { name: "Agenda", exact: true });
  await expect(agenda).toBeVisible();
  await expect(agenda.getByRole("link").first()).toBeVisible();
});
