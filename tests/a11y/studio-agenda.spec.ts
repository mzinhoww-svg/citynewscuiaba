import { expect, test } from "@playwright/test";
import { loginAs } from "../e2e/helpers/studio-login";
import { service } from "../e2e/studio";
import { expectNoSeriousViolations } from "./axe";

/*
 * AGM-T7 · Acessibilidade (WCAG 2.2 AA, 0 violações serious/critical) da Agenda do Estúdio:
 * lista com filtros, vazio por filtro, cadastro com erros, edição e a aba Sugestões, em 360, 768
 * e 1280 px. Só leitura (o envio inválido não grava nada); editor-chefe do seed.
 */

const WIDTHS = [360, 768, 1280] as const;
let seededId = "";

test.beforeAll(async () => {
  const r = await service()
    .from("event_listings")
    .select("id")
    .eq("slug", "noite-de-rasqueado-no-sesc-arsenal")
    .single();
  seededId = r.data!.id;
});

for (const width of WIDTHS) {
  test.describe(`Agenda do Estúdio em ${width} px`, () => {
    test.use({ viewport: { width, height: 900 } });

    test.beforeEach(async ({ page, baseURL }) => {
      await loginAs(page.context(), "marina", baseURL);
    });

    test("lista e vazio por filtro", async ({ page }) => {
      await page.goto("/estudio/agenda");
      await expect(page.getByRole("heading", { level: 1, name: "Agenda" })).toBeVisible();
      await expect(page.getByRole("navigation", { name: "Abas da Agenda" })).toBeVisible();
      await expect(page.getByRole("table", { name: "Eventos da agenda" })).toBeVisible();
      await expectNoSeriousViolations(page);

      await page.goto("/estudio/agenda?q=nada-com-esse-nome-agm");
      await expect(
        page.getByRole("heading", { name: "Nenhum evento com estes filtros" }),
      ).toBeVisible();
      await expectNoSeriousViolations(page);
    });

    test("cadastro com erros por campo", async ({ page }) => {
      await page.goto("/estudio/agenda/novo");
      await expect(page.getByRole("heading", { level: 1, name: "Novo evento" })).toBeVisible();
      await expectNoSeriousViolations(page);
      await page.getByLabel("Link oficial (opcional)").fill("http://exemplo.example");
      await page.getByRole("button", { name: "Salvar evento" }).click();
      await expect(page.getByRole("alert").filter({ hasText: /Corrija \d+ campos/ })).toBeVisible({
        timeout: 30_000,
      });
      await expectNoSeriousViolations(page);
    });

    test("edição e aba Sugestões", async ({ page }) => {
      await page.goto(`/estudio/agenda/${seededId}`);
      await expect(page.getByRole("heading", { level: 2, name: "Situação" })).toBeVisible();
      await expectNoSeriousViolations(page);
      await page.goto("/estudio/agenda/sugestoes");
      await expect(page.getByRole("link", { name: "Sugestões" })).toHaveAttribute(
        "aria-current",
        "page",
      );
      await expectNoSeriousViolations(page);
    });
  });
}
