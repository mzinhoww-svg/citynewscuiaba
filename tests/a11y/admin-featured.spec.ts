import { expect, test } from "@playwright/test";
import { expectHydrated } from "../e2e/helpers/hydration";
import {
  acquireFeaturedLock,
  cleanFixtures,
  createPublished,
  endAllPins,
  newFixtures,
  pinViaDb,
} from "../e2e/helpers/featured";
import { loginAs } from "../e2e/studio";
import { expectNoSeriousViolations, settle, smallTargets } from "./axe";

/*
 * FD-T4 · Acessibilidade da tela de destaques (WCAG 2.2 AA, 0 violações serious/critical) nos
 * temas claro e escuro, em 390 e 1280 px (projetos mobile e desktop): a tela com o quadro, o
 * formulário de fixar aberto com resultados da busca e o diálogo de remover com digitação.
 * Mutações (pino para o diálogo de remover) só no desktop e com o cadeado dos destaques.
 */

const PAGE = "/estudio/admin/destaques";

for (const scheme of ["light", "dark"] as const) {
  test.describe(`tema ${scheme}`, () => {
    test.use({ colorScheme: scheme });

    test(`@a11y destaques: quadro e histórico (${scheme})`, async ({ page }) => {
      await loginAs(page, "helena", PAGE);
      await expect(page.getByRole("heading", { level: 1, name: "Destaques" })).toBeVisible();
      await expect(page.getByRole("region", { name: "Início · manchete" })).toBeVisible();
      await expectNoSeriousViolations(page);
      expect(await smallTargets(page)).toEqual([]);
    });

    test(`@a11y destaques: formulário de fixar aberto (${scheme})`, async ({ page }) => {
      await loginAs(page, "helena", PAGE);
      const fix = page
        .getByRole("region", { name: "Início · manchete" })
        .getByRole("button", { name: /Fixar matéria/ });
      await expectHydrated(fix);
      await fix.click();
      const dialog = page.getByRole("dialog");
      await dialog.getByLabel("Buscar por título").fill("plano");
      await settle(page);
      await expectNoSeriousViolations(page);
    });

    test(`@a11y destaques: diálogo de remover (${scheme})`, async ({ page }, info) => {
      test.skip(info.project.name !== "desktop", "cria pino: só no projeto desktop");
      const fx = newFixtures();
      const release = await acquireFeaturedLock();
      try {
        await endAllPins();
        const a = await createPublished(fx, { title: `Axe fixada ${scheme}`, hoursAgo: 30 });
        await pinViaDb("home.lead", a.id);
        await loginAs(page, "helena", PAGE);
        const remove = page.getByRole("button", { name: `Remover: ${a.title}` });
        await expectHydrated(remove);
        await remove.click();
        await expect(page.getByRole("dialog")).toBeVisible();
        await expectNoSeriousViolations(page);
      } finally {
        try {
          await cleanFixtures(fx);
        } finally {
          release();
        }
      }
    });
  });
}
