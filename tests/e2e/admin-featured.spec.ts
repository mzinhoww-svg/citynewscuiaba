import { expect, test, type Page } from "@playwright/test";
import { expectHydrated } from "./helpers/hydration";
import {
  acquireFeaturedLock,
  cleanFixtures,
  createPublished,
  endAllPins,
  newFixtures,
  pinViaDb,
} from "./helpers/featured";
import { loginAs, service } from "./studio";

/*
 * FD-T4 · Gestão dos destaques em /estudio/admin/destaques: o admin fixa, a home mostra; remove,
 * volta ao automático; matéria sem capa é bloqueada; remover com mais de 24 h pede digitar; os
 * botões Subir e Descer reordenam; quem não tem a permissão é mandado para a tela de entrada com
 * "sem permissão" (o Estúdio não tem página 403 separada). Mutações só no projeto desktop e com o
 * cadeado dos destaques (as posições são globais).
 */

const PAGE = "/estudio/admin/destaques";
const h1Text = async (page: Page) =>
  (await page.getByRole("heading", { level: 1 }).innerText()).trim();

test("jornalista sem a permissão é mandado para a entrada com 'sem permissão'", async ({
  page,
}) => {
  await loginAs(page, "juliana");
  await page.goto(PAGE);
  await expect(page).toHaveURL(/\/entrar\?next=.*motivo=sem-permissao/);
});

test("editora-chefe entra na tela", async ({ page }) => {
  await loginAs(page, "marina", PAGE);
  await expect(page.getByRole("heading", { level: 1, name: "Destaques" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Início · manchete" })).toBeVisible();
});

test.describe("fixar, trocar, remover e reordenar", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(180_000);

  const fx = newFixtures();
  const mark = Date.now().toString(36);
  const t = (s: string) => `${s} ${mark}`;
  let release: (() => void) | null = null;
  let auto = { id: "", slug: "", title: "" };
  let chosen = { id: "", slug: "", title: "" };
  let noCover = { id: "", slug: "", title: "" };
  let extra = { id: "", slug: "", title: "" };

  test.beforeAll(async ({}, info) => {
    if (info.project.name !== "desktop") return;
    release = await acquireFeaturedLock();
    await endAllPins();
    auto = await createPublished(fx, {
      title: t("Manchete do automático"),
      hoursAgo: 6,
      confidence: 0.95,
    });
    chosen = await createPublished(fx, {
      title: t("Matéria escolhida pelo admin"),
      hoursAgo: 30,
      confidence: 0.2,
    });
    noCover = await createPublished(fx, {
      title: t("Matéria escolhida sem capa"),
      hoursAgo: 30,
      cover: false,
    });
    extra = await createPublished(fx, {
      title: t("Segunda matéria fixada"),
      hoursAgo: 31,
      confidence: 0.2,
    });
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

  const leadCard = (page: Page) => page.getByRole("region", { name: "Início · manchete" });

  async function searchAndPick(page: Page, title: string) {
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Buscar por título").fill(title);
    await expect(dialog.getByRole("listitem").filter({ hasText: title })).toBeVisible();
    return dialog;
  }

  test("o quadro mostra o automático e o aviso 'Sem pino'", async ({ page }) => {
    await loginAs(page, "helena", PAGE);
    const card = leadCard(page);
    await expect(card.getByTestId("slot-source")).toContainText("Automático");
    await expect(card.getByText(/Sem pino: o automático ocupa até/)).toBeVisible();
    await expect(card.getByRole("link", { name: auto.title })).toBeVisible();
  });

  test("fixar pelo teclado e pelo formulário: a home mostra a matéria; remover volta ao automático", async ({
    page,
  }) => {
    await loginAs(page, "helena", PAGE);
    const fix = leadCard(page).getByRole("button", { name: /Fixar matéria/ });
    await expectHydrated(fix);
    await fix.focus();
    await page.keyboard.press("Enter");
    const dialog = await searchAndPick(page, chosen.title);

    await dialog.getByRole("button", { name: `Escolher: ${chosen.title}` }).click();
    await expect(dialog.getByTestId("pin-chosen")).toContainText(chosen.title);
    await dialog.getByRole("radio", { name: "6 h" }).check({ force: true });
    await expect(dialog.getByTestId("pin-preview")).toContainText(
      `Início · manchete passa a mostrar: ${chosen.title}`,
    );
    await dialog.getByRole("button", { name: "Fixar", exact: true }).click();

    await expect(page.getByRole("status").filter({ hasText: "Matéria fixada" })).toBeVisible();
    const card = leadCard(page);
    await expect(card.getByTestId("slot-source")).toContainText("Fixada");
    await expect(card.getByTestId("pin-info")).toContainText("Fixada por Helena");
    await expect(card.getByRole("link", { name: chosen.title })).toBeVisible();

    // A ação invalidou a tag `home`: a manchete pública muda na hora.
    await expect
      .poll(
        async () => {
          await page.goto("/");
          return h1Text(page);
        },
        { timeout: 20_000 },
      )
      .toBe(chosen.title);

    // Faltando menos de 24 h, remover é direto.
    await page.goto(PAGE);
    await leadCard(page)
      .getByRole("button", { name: `Remover: ${chosen.title}` })
      .click();
    await expect(page.getByRole("status").filter({ hasText: "Fixação removida" })).toBeVisible();
    await expect(leadCard(page).getByTestId("slot-source")).toContainText("Automático");
    await expect
      .poll(
        async () => {
          await page.goto("/");
          return h1Text(page);
        },
        { timeout: 20_000 },
      )
      .toBe(auto.title);

    // O histórico guarda a fixação, quem fez e que foi removida.
    await page.goto(PAGE);
    const row = page.getByRole("row").filter({ hasText: chosen.title });
    await expect(row).toContainText("Helena");
    await expect(row).toContainText("Removido");
  });

  test("sem prazo, remover pede digitar REMOVER", async ({ page }) => {
    await pinViaDb("home.lead", chosen.id);
    await loginAs(page, "helena", PAGE);
    await leadCard(page)
      .getByRole("button", { name: `Remover: ${chosen.title}` })
      .click();
    const dialog = page.getByRole("dialog");
    const confirm = dialog.getByRole("button", { name: "Remover fixação" });
    await expect(confirm).toBeDisabled();
    await dialog.getByLabel("Digite REMOVER").fill("REMOVER");
    await expect(confirm).toBeEnabled();
    await confirm.click();
    await expect(page.getByRole("status").filter({ hasText: "Fixação removida" })).toBeVisible();
  });

  test("matéria sem capa é bloqueada com aviso", async ({ page }) => {
    await loginAs(page, "helena", PAGE);
    const fix = leadCard(page).getByRole("button", { name: /Fixar matéria/ });
    await expectHydrated(fix);
    await fix.click();
    const dialog = await searchAndPick(page, noCover.title);
    await expect(dialog.getByText("Sem capa aprovada", { exact: true })).toBeVisible();
    await expect(dialog.getByRole("note")).toContainText("não pode ser destaque");
    await expect(dialog.getByRole("button", { name: `Escolher: ${noCover.title}` })).toBeDisabled();
    await expect(dialog.getByRole("button", { name: "Fixar", exact: true })).toBeDisabled();
    // Esc fecha e o foco volta para o botão que abriu.
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(fix).toBeFocused();
  });

  test("Subir e Descer reordenam os destaques da home (sem arrastar)", async ({ page }) => {
    const first = await pinViaDb("home.destaques", chosen.id);
    const second = await pinViaDb("home.destaques", extra.id);
    await loginAs(page, "helena", PAGE);
    const card = page.getByRole("region", { name: "Início · destaques" });
    const titles = () => card.getByRole("listitem").getByRole("link").allInnerTexts();
    await expect.poll(titles).toEqual([chosen.title, extra.title]);
    await card.getByRole("button", { name: `Subir: ${extra.title}` }).click();
    await expect(page.getByRole("status").filter({ hasText: "Ordem atualizada" })).toBeVisible();
    await expect.poll(titles).toEqual([extra.title, chosen.title]);
    const rows = await service()
      .from("featured_items")
      .select("id, position")
      .in("id", [first, second]);
    const pos = new Map((rows.data ?? []).map((r) => [r.id, r.position]));
    expect(pos.get(second)).toBeLessThan(pos.get(first)!);
  });
});
