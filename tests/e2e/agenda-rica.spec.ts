import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { localDateKey } from "@/lib/format/date";
import { serviceClient } from "./helpers/pipeline";
import { loginAs } from "./helpers/studio-login";

/**
 * Agenda rica (ARD-T4, spec 2026-10-08-agenda-rica-e-distribuicao §4–§5). Projeto `fixtures`
 * (em série, depois dos projetos de navegador): destacar no Estúdio muda a faixa "Em destaque"
 * de /agenda, estado global que os specs paralelos da agenda não podem ver no meio.
 * Evento próprio (TAG) com foto de divulgação no Media Registry (sem bytes no Storage local: a
 * foto cai no marcador, a legenda e o link "Ver original" aparecem), organização e faixa 12.
 */
test.describe.configure({ mode: "serial" });

const TAG = `ard${Date.now().toString(36)}`;
const TITLE = `Forró da Praça ${TAG}`;
const DAY = 86_400_000;
let eventId = "";
let slug = "";
let mediaId = "";

test.beforeAll(async () => {
  const db = serviceClient();
  const m = await db
    .from("media_assets")
    .insert({
      kind: "reproduction",
      storage_path: `reproducao/${TAG}.jpg`,
      origin_url: `https://forro.example/${TAG}.jpg`,
      page_url: "https://forro.example/praca",
      source_name: "Fonte",
      license: "reproducao",
      allowed_use: "event",
      credit: "Foto: reprodução web · Fonte",
      status: "approved",
      width: 1200,
      height: 800,
    })
    .select("id")
    .single();
  if (m.error) throw m.error;
  mediaId = m.data.id;
  slug = `forro-da-praca-${TAG}`;
  const e = await db
    .from("event_listings")
    .insert({
      slug,
      title: TITLE,
      starts_at: new Date(Date.now() + 3 * DAY).toISOString(),
      venue: "Praça da República",
      category: "musica",
      age_rating: "12",
      price_cents: 0,
      origin: "newsroom",
      confirmed_at: new Date().toISOString(),
      organizer: "Coletivo Forró do Porto",
      media_id: mediaId,
      source_url: "https://forro.example/praca",
    })
    .select("id")
    .single();
  if (e.error) throw e.error;
  eventId = e.data.id;
});

test.afterAll(async () => {
  const db = serviceClient();
  if (eventId) {
    await db.from("audit_log").delete().eq("object_ref", `event:${eventId}`);
    await db.from("event_listings").delete().eq("id", eventId);
  }
  if (mediaId) await db.from("media_assets").delete().eq("id", mediaId);
});

test("destacar no Estúdio põe o evento na faixa Em destaque; tirar destaque o retira", async ({
  page,
  baseURL,
}) => {
  test.setTimeout(180_000);
  await page.goto("/agenda");
  await expect(page.getByTestId("agenda-featured").getByText(TITLE)).toHaveCount(0);

  await loginAs(page.context(), "otavio", baseURL);
  await page.goto(`/estudio/agenda/${eventId}`);
  await expect(page.getByTestId("feature-current")).toHaveText("Sem destaque");
  const until = localDateKey(new Date(Date.now() + 5 * DAY));
  await page.getByLabel("Destacar até").fill(until);
  await page.getByRole("button", { name: "Destacar", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Evento em destaque na Agenda" }),
  ).toBeVisible({ timeout: 60_000 });
  const [, mm, dd] = until.split("-");
  await expect(page.getByTestId("feature-current")).toHaveText(`Em destaque até ${dd}/${mm}`);

  await page.goto(`/estudio/agenda?q=${encodeURIComponent(TAG)}`);
  await expect(page.getByRole("row").filter({ hasText: TITLE })).toContainText(
    `Em destaque até ${dd}/${mm}`,
  );

  await page.goto("/agenda");
  const strip = page.getByTestId("agenda-featured");
  await expect(strip.getByRole("heading", { name: "Em destaque" })).toBeVisible();
  await expect(strip.getByRole("link", { name: TITLE, exact: true })).toBeVisible();
  await expect(strip).toContainText("Foto: reprodução web · Fonte");
  // Com filtro, a faixa some (a lista filtra normalmente).
  await page.goto("/agenda?gratuito=1");
  await expect(page.getByTestId("agenda-featured")).toHaveCount(0);

  const audit = await serviceClient()
    .from("audit_log")
    .select("action, details")
    .eq("object_ref", `event:${eventId}`)
    .eq("action", "event.feature");
  expect(audit.data).toHaveLength(1);

  // Axe com a faixa e a foto na tela, nas três larguras.
  for (const width of [360, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    for (const url of ["/agenda", `/agenda/${slug}`]) {
      await page.goto(url);
      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations, `${url} @ ${width}px`).toEqual([]);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
        url,
      ).toBeLessThanOrEqual(width);
    }
  }
  await page.setViewportSize({ width: 1280, height: 800 });

  await page.goto(`/estudio/agenda/${eventId}`);
  await page.getByRole("button", { name: "Tirar destaque" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Destaque retirado" })).toBeVisible({
    timeout: 60_000,
  });
  await page.goto("/agenda");
  await expect(page.getByTestId("agenda-featured").getByText(TITLE)).toHaveCount(0);
});

test("página do evento: foto com legenda, Ver original, organização, faixa e Salvar", async ({
  page,
}) => {
  await page.goto(`/agenda/${slug}`);
  const figure = page.getByRole("figure");
  await expect(figure).toContainText("Foto: reprodução web · Fonte");
  await expect(figure.getByRole("link", { name: /Ver original/ })).toHaveAttribute(
    "href",
    "https://forro.example/praca",
  );
  await expect(page.getByText("Coletivo Forró do Porto")).toBeVisible();
  await expect(page.getByText("A partir de 12 anos")).toBeVisible();
  await expect(page.getByRole("button", { name: `Salvar ${TITLE}` })).toBeVisible();
});

test("filtro por faixa etária: até a escolhida, consulte só sem filtro, inválido ignorado", async ({
  page,
}) => {
  await page.goto("/agenda?idade=12");
  await expect(page.getByRole("link", { name: TITLE, exact: true }).first()).toBeVisible();
  // Seed: "Noite de rasqueado" é 16 anos.
  await expect(page.getByText("Noite de rasqueado no Sesc Arsenal")).toHaveCount(0);
  await expect(page.getByTestId("agenda-featured")).toHaveCount(0);

  await page.goto("/agenda?idade=livre");
  await expect(page.getByRole("link", { name: TITLE, exact: true })).toHaveCount(0);

  await serviceClient().from("event_listings").update({ age_rating: "consulte" }).eq("id", eventId);
  await page.goto("/agenda?idade=18");
  await expect(page.getByRole("link", { name: TITLE, exact: true })).toHaveCount(0);
  await page.goto("/agenda");
  await expect(page.getByRole("link", { name: TITLE, exact: true }).first()).toBeVisible();
  await page.goto("/agenda?idade=15");
  await expect(page.getByRole("link", { name: TITLE, exact: true }).first()).toBeVisible();
});
