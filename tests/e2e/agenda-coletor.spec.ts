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
