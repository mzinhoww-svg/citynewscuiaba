import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { forwardedFor } from "./own-ip";
import { createArticle, loginAs, removeArticles, service, tag } from "./studio";

/*
 * AUT-T5 (A9): 3 denúncias em 24 h na mesma matéria ligam o banner público "Esta matéria está em
 * revisão" (a matéria segue no ar) e abrem um item urgente em /estudio/denuncias; encerrar a
 * revisão desliga o banner.
 */

const BANNER = "Esta matéria está em revisão";
const articles: string[] = [];

test.afterAll(async () => {
  const db = service();
  if (articles.length) {
    await db.from("review_escalations").delete().in("article_id", articles);
    await db
      .from("reports")
      .delete()
      .in(
        "content_ref",
        articles.map((a) => `article:${a}`),
      );
  }
  await removeArticles(articles);
});

async function report(page: Page, slug: string) {
  await page.goto(`/materia/${slug}`);
  await page.getByRole("button", { name: "Informar problema" }).first().click();
  await page.getByLabel("Informação errada").check();
  await page.getByRole("button", { name: "Enviar" }).click();
  await expect(page.getByRole("dialog").getByRole("status")).toContainText(
    "Resposta da redação em até 24 h",
  );
}

test("o banner aparece na 3ª denúncia, a matéria segue no ar e some quando a revisão é encerrada", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const title = `Matéria denunciada ${tag()}`;
  const id = await createArticle({
    title,
    status: "published",
    published_at: new Date().toISOString(),
  });
  articles.push(id);
  const slug = (await service().from("articles").select("slug").eq("id", id).single()).data!.slug;

  await page.setExtraHTTPHeaders(forwardedFor());
  await page.goto(`/materia/${slug}`);
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  await expect(page.getByText(BANNER)).toHaveCount(0);

  await report(page, slug);
  await report(page, slug);
  await page.goto(`/materia/${slug}`);
  await expect(page.getByText(BANNER)).toHaveCount(0);

  await report(page, slug);
  await page.goto(`/materia/${slug}`);
  await expect(page.getByText(BANNER)).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  const main = await page.locator("main").innerText();
  expect(main).not.toMatch(/\bIA\b|inteligência artificial|revisad|em apuração|automátic/i);
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual(
    [],
  );

  // A moderação vê o item urgente e encerra a revisão.
  await loginAs(page, "carlos", "/estudio/denuncias");
  const urgent = page.getByRole("region", { name: "Urgente: matéria com várias denúncias" });
  await expect(urgent.getByRole("link", { name: title })).toBeVisible();
  await urgent
    .getByRole("listitem")
    .filter({ hasText: title })
    .getByRole("button", { name: "Encerrar revisão" })
    .click();
  await expect(page.getByText("Revisão encerrada: o aviso saiu da matéria")).toBeVisible();

  await page.goto(`/materia/${slug}`);
  await expect(page.getByText(BANNER)).toHaveCount(0);
});
