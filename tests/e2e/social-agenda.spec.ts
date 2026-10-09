import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { strFromU8, unzipSync } from "fflate";
import { addDays } from "@/lib/format/date";
import { weekRange } from "@/lib/social/pick-week";
import { cronSecret, serviceClient } from "./helpers/pipeline";
import { loginAs } from "./helpers/studio-login";

/**
 * Pacote "Agenda da semana" do Instagram (ARD-T6, spec 2026-10-08 §7). Projeto `fixtures`
 * (servidor de desenvolvimento com `SOCIAL_STORE=memory`: a pilha local não tem Storage, A-017,
 * e o job e as telas do Estúdio dividem o mesmo armazenamento em memória do processo). Semana
 * distante e própria (sem evento do seed): o job monta, a editora abre, aprova e baixa o ZIP.
 */
test.describe.configure({ mode: "serial" });

const TAG = `ard6${Date.now().toString(36)}`;
const WEEK = weekRange(new Date(), addDays("2041-01-07", 7 * (Date.now() % 200))).weekStart;
const PAGE = `/estudio/agenda/instagram?semana=${WEEK}`;
const slugs: string[] = [];

test.beforeAll(async () => {
  const rows = [1, 2].map((n) => {
    const slug = `${TAG}-${n}`;
    slugs.push(slug);
    return {
      slug,
      title: `Noite do Siriri ${n} ${TAG}`,
      starts_at: new Date(`${addDays(WEEK, n + 1)}T20:00:00-04:00`).toISOString(),
      venue: `Praça Fictícia ${n}`,
      category: "musica",
      origin: "newsroom",
      price_cents: n === 1 ? 0 : 3500,
      confirmed_at: new Date().toISOString(),
    };
  });
  const ins = await serviceClient().from("event_listings").insert(rows);
  if (ins.error) throw ins.error;
});

test.afterAll(async () => {
  const db = serviceClient();
  await db.from("event_listings").delete().in("slug", slugs);
  await db.from("social_packages").delete().eq("kind", "instagram_agenda").eq("week_start", WEEK);
  await db.from("audit_log").delete().eq("object_ref", `social:instagram_agenda:${WEEK}`);
});

test("editora abre o pacote da semana, aprova e baixa o ZIP", async ({
  page,
  baseURL,
  playwright,
}) => {
  test.setTimeout(240_000);
  const api = await playwright.request.newContext({ baseURL });
  const job = await api.post(`/api/jobs/social-agenda?semana=${WEEK}`, {
    headers: { authorization: `Bearer ${cronSecret()}` },
    timeout: 120_000,
  });
  expect(job.status()).toBe(200);
  expect(await job.json()).toMatchObject({ outcome: "built", events: 2, slides: 4 });
  await api.dispose();

  await loginAs(page.context(), "otavio", baseURL);
  await page.goto(PAGE);
  await expect(
    page.getByRole("heading", { level: 1, name: "Instagram: Agenda da semana" }),
  ).toBeVisible({
    timeout: 60_000,
  });
  await expect(
    page.getByRole("tab", { name: "Instagram" }).or(page.getByRole("link", { name: "Instagram" })),
  ).toHaveAttribute("aria-current", "page");
  await expect(page.getByTestId("social-status")).toHaveText("Rascunho");
  const caption = page.getByLabel("Legenda pronta para colar");
  await expect(caption).toHaveValue(/Noite do Siriri 1/);
  await expect(caption).toHaveValue(
    /Confirme horários e valores na fonte oficial antes de sair de casa\.$/,
  );
  const slides = page.getByRole("img", { name: /^Slide \d de 4/ });
  await expect(slides).toHaveCount(4);
  for (const img of await slides.all()) {
    await img.scrollIntoViewIfNeeded();
    await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBe(1080);
  }
  // Sem aprovar, nada de ZIP; a rota recusa também.
  await expect(page.getByRole("link", { name: "Baixar ZIP" })).toHaveCount(0);
  expect((await page.request.get(`/estudio/agenda/instagram/zip?semana=${WEEK}`)).status()).toBe(
    409,
  );

  for (const width of [360, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(PAGE);
    await expect(page.getByTestId("social-status")).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations, `@ ${width}px`).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
  }
  await page.setViewportSize({ width: 1280, height: 800 });

  await page.getByRole("button", { name: "Aprovar" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Pacote aprovado" })).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByTestId("social-status")).toHaveText("Aprovado");

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "Baixar ZIP" }).click(),
  ]);
  expect(download.suggestedFilename()).toBe(`agenda-da-semana-${WEEK}.zip`);
  const files = unzipSync(new Uint8Array(readFileSync((await download.path())!)));
  expect(Object.keys(files).sort()).toEqual(
    ["01.png", "02.png", "03.png", "04.png", "caption.txt", "creditos.txt"].sort(),
  );
  expect(strFromU8(files["caption.txt"]!)).toContain(`Noite do Siriri 2 ${TAG}`);

  // Axe também no estado aprovado (com o campo do link do post).
  const approved = await new AxeBuilder({ page }).analyze();
  expect(approved.violations).toEqual([]);

  await page
    .getByLabel("Link do post no Instagram")
    .fill("https://www.instagram.com/p/EXEMPLO123/");
  await page.getByRole("button", { name: "Marcar como publicado" }).click();
  await expect(page.getByTestId("social-status")).toHaveText("Publicado", { timeout: 60_000 });

  const audit = await serviceClient()
    .from("audit_log")
    .select("action")
    .eq("object_ref", `social:instagram_agenda:${WEEK}`);
  expect((audit.data ?? []).map((a) => a.action).sort()).toEqual(
    ["social.approve", "social.build", "social.publish"].sort(),
  );
});
