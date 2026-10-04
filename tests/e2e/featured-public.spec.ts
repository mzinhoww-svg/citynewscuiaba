import { expect, test, type Page } from "@playwright/test";
import { expectNoSeriousViolations } from "../a11y/axe";
import { service } from "./studio";
import {
  acquireFeaturedLock,
  cleanFixtures,
  createPublished,
  createTopic,
  endAllPins,
  newFixtures,
  pinViaDb,
  reloadUntil,
} from "./helpers/featured";

/*
 * FD-T2 · Destaques estáveis nas páginas públicas (R28, R39 e R40 do dono):
 *  - dois carregamentos seguidos da home trazem a mesma manchete;
 *  - a manchete tem sempre capa aprovada (candidata sem capa é pulada e a busca de imagem é pedida);
 *  - "Assuntos em destaque" nunca repete a manchete e só mostra assunto com foto;
 *  - pino manual passa na frente na home e na editoria; a urgência continua na frente de tudo.
 * As mutações rodam só no projeto desktop (as posições são globais) e com o cadeado dos destaques;
 * o celular confere o que não muda dado.
 */

const h1Text = async (page: Page) =>
  (await page.getByRole("heading", { level: 1 }).innerText()).trim();

test("dois carregamentos seguidos da home trazem a mesma manchete", async ({ page }) => {
  await page.goto("/");
  const first = await h1Text(page);
  await page.goto("/");
  expect(await h1Text(page)).toBe(first);
  await page.reload();
  expect(await h1Text(page)).toBe(first);
});

test("a manchete mostra título, resumo e, havendo capa aprovada, a foto", async ({ page }) => {
  await page.goto("/");
  const lead = page.locator("main article").first();
  await expect(lead.getByRole("heading", { level: 1 })).toBeVisible();
  // Sem capa em nenhuma matéria da lista (banco só com o seed), a manchete cai no cartão da
  // editoria; com capa, a foto aparece. Nunca os dois ao mesmo tempo.
  const photo = lead.locator("img");
  const typographic = lead.getByTestId("typographic-cover");
  expect((await photo.count()) > 0 !== (await typographic.count()) > 0).toBe(true);
});

test.describe("posições com dados de teste", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(300_000);

  const fx = newFixtures();
  let release: (() => void) | null = null;
  const mark = Date.now().toString(36);
  const t = (s: string) => `${s} ${mark}`;
  let hero = { id: "", slug: "", title: "" };
  let noCover = { id: "", slug: "", title: "" };
  let topicA = "";
  let topicB = "";
  let topicC = "";
  const other = { id: "", slug: "", title: "" };

  test.beforeAll(async ({}, info) => {
    if (info.project.name !== "desktop") return;
    release = await acquireFeaturedLock();
    await endAllPins();
    topicA = await createTopic(fx, t("Assunto da manchete"));
    topicB = await createTopic(fx, t("Assunto com foto"));
    topicC = await createTopic(fx, t("Assunto sem foto"));
    hero = await createPublished(fx, {
      title: t("Manchete automática"),
      hoursAgo: 4,
      confidence: 0.9,
      topicId: topicA,
    });
    noCover = await createPublished(fx, {
      title: t("Candidata sem capa"),
      hoursAgo: 4,
      confidence: 1,
      cover: false,
    });
    // As matérias do assunto B (com foto) e C (sem foto) são mais antigas que o resto: as vagas de
    // destaques (3 com capa) e o Agora (6 mais novas) levam antes os reforços abaixo, então sobram
    // para o módulo de assuntos, que vem depois na página (R40: nada se repete).
    Object.assign(
      other,
      await createPublished(fx, {
        title: t("Matéria do assunto B"),
        hoursAgo: 20,
        confidence: 0.3,
        topicId: topicB,
      }),
    );
    await createPublished(fx, {
      title: t("Matéria do assunto C"),
      hoursAgo: 20,
      confidence: 0.3,
      topicId: topicC,
      cover: false,
    });
    for (let i = 0; i < 4; i++)
      await createPublished(fx, {
        title: t(`Reforço com capa ${i}`),
        hoursAgo: 3,
        confidence: 0.6,
      });
    for (let i = 0; i < 8; i++)
      await createPublished(fx, { title: t(`Reforço sem capa ${i}`), hoursAgo: 2, cover: false });
  });

  test.afterAll(async () => {
    try {
      await cleanFixtures(fx);
    } finally {
      release?.();
    }
  });

  test.beforeEach(({}, info) => {
    test.skip(info.project.name !== "desktop", "mexe nas posições globais: só no projeto desktop");
  });

  test("R39: a manchete automática tem capa, pula a candidata sem capa e pede a imagem dela", async ({
    page,
  }) => {
    await reloadUntil(page, "/", async () => (await h1Text(page)) === hero.title);
    const lead = page.locator("main article").first();
    await expect(lead.locator("img")).toHaveCount(1);
    await expect(lead.getByTestId("typographic-cover")).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 1, name: noCover.title })).toHaveCount(0);
    // A busca de imagem da candidata sem capa foi enfileirada (uma vez, na fila de mídia).
    await expect
      .poll(
        async () =>
          (
            await service()
              .from("jobs")
              .select("id")
              .eq("dedupe_key", `image:article:${noCover.id}`)
          ).data?.length,
        { timeout: 30_000 },
      )
      .toBe(1);
  });

  test("R40: assuntos em destaque não repetem a manchete e exigem foto", async ({ page }) => {
    const topics = page.getByRole("region", { name: "Assuntos em destaque" });
    // O cache de dados da home é de 60 s: espera o assunto com foto entrar.
    await reloadUntil(
      page,
      "/",
      async () => (await topics.getByRole("link", { name: t("Assunto com foto") }).count()) > 0,
    );
    await expect(topics).toBeVisible();
    // Assunto da manchete, e assunto sem foto, ficam de fora; o assunto com foto entra com a imagem.
    await expect(topics.getByRole("link", { name: t("Assunto da manchete") })).toHaveCount(0);
    await expect(topics.getByRole("link", { name: t("Assunto sem foto") })).toHaveCount(0);
    const card = topics.locator("article", {
      has: page.getByRole("link", { name: t("Assunto com foto") }),
    });
    await expect(card).toHaveCount(1);
    await expect(card.locator("img")).toHaveCount(1);
    // Cada assunto exibido traz foto.
    const cards = topics.locator("article");
    for (let i = 0; i < (await cards.count()); i++)
      await expect(cards.nth(i).locator("img")).toHaveCount(1);
    // A matéria da manchete aparece uma vez só na página.
    await expect(page.locator(`a[href="/materia/${hero.slug}"]`)).toHaveCount(1);

    // Posição home.destaques: até 3 com capa, sem a manchete; a página inteira passa no axe.
    const highlights = page.getByRole("region", { name: "Em destaque", exact: true });
    await expect(highlights).toBeVisible();
    const items = highlights.locator("article");
    expect(await items.count()).toBeGreaterThan(0);
    expect(await items.count()).toBeLessThanOrEqual(3);
    for (let i = 0; i < (await items.count()); i++)
      await expect(items.nth(i).locator("img")).toHaveCount(1);
    await expect(highlights.getByRole("link", { name: hero.title })).toHaveCount(0);
    await expectNoSeriousViolations(page);
  });

  test("pino manual passa na frente na home e na editoria; a urgência continua na frente", async ({
    page,
  }) => {
    const pinned = await createPublished(fx, {
      title: t("Manchete fixada"),
      hoursAgo: 40,
      confidence: 0.2,
    });
    const section = await createPublished(fx, {
      title: t("Destaque fixado da Cidade"),
      hoursAgo: 50,
      confidence: 0.2,
    });
    await pinViaDb("home.lead", pinned.id);
    await pinViaDb("editoria.lead", section.id, { section: "cidade" });

    // Editoria: lida sem cache de dados, aparece de imediato e abre a lista.
    await page.goto("/cidade");
    await expect(
      page.locator("#lista li").first().getByRole("link", { name: section.title }),
    ).toBeVisible();

    // Home: o cache de dados é de 60 s; o pino aparece assim que ele vence.
    await reloadUntil(page, "/", async () => (await h1Text(page)) === pinned.title);
    expect(await h1Text(page)).toBe(pinned.title);

    const urgent = await createPublished(fx, {
      title: t("Urgente da hora"),
      hoursAgo: 1,
      urgent: true,
      cover: false,
    });
    await reloadUntil(
      page,
      "/",
      async () => (await page.getByRole("alert").filter({ hasText: urgent.title }).count()) > 0,
    );
    await expect(page.getByRole("alert").filter({ hasText: urgent.title })).toBeVisible();
    expect(await h1Text(page)).toBe(pinned.title);
  });

  test("a mesma manchete sai de dois carregamentos e de uma nova aba (cache diferente)", async ({
    page,
    context,
  }) => {
    await page.goto("/");
    const first = await h1Text(page);
    const other = await context.newPage();
    await other.goto("/");
    expect(await h1Text(other)).toBe(first);
    await other.close();
  });
});
