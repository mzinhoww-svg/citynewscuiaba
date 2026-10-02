import { expect, test } from "@playwright/test";
import { loginAs } from "./studio";

/* Comparação de versões (E05 · P4-T4): diff por palavra com legenda textual. */
test("compara a versão corrigida com a primeira", async ({ page }) => {
  await loginAs(page, "marina");
  await page.goto("/estudio/materias/c2000000-0000-4000-8000-000000000004/versoes?de=1&para=2");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("educação física");
  const body = page.getByRole("region", { name: "v1 × v2" });
  await expect(body.locator("dd del")).toContainText("18");
  await expect(body.locator("dd ins")).toContainText("20");
  await expect(
    page.getByText(/Nota pública: Cada aula ao ar livre dura no máximo 20 minutos/),
  ).toBeVisible();
});
