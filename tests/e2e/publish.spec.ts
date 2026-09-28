import { expect, test } from "@playwright/test";
import { createArticle, loginAs, removeArticles, tag } from "./studio";

/*
 * Publicação e agendamento (E06 · P4-T5, Review Focus 5): horário passado é recusado com
 * mensagem; agendar com checklist completo deixa a matéria agendada; push não sai daqui.
 */
const created: string[] = [];
test.afterAll(() => removeArticles(created));

test("agendamento para horário passado é recusado e futuro é aceito", async ({ page }) => {
  const t = tag();
  const id = await createArticle({
    title: `Temporada de teatro no Porto ${t}`,
    section_slug: "cultura",
    status: "in_review",
    tags: ["teatro"],
    neighborhoods: ["porto"],
    seo_title: "Temporada de teatro no Porto",
    seo_description: "Grupos locais se apresentam às sextas e aos sábados no Porto.",
  });
  created.push(id);

  await loginAs(page, "marina");
  await page.goto(`/estudio/materias/${id}`);
  await page.getByRole("button", { name: "Publicar", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Publicação e agendamento" });
  await expect(dialog.getByText(/Push exige 2 aprovações/)).toBeVisible();
  await expect(dialog.getByRole("checkbox", { name: "Push de urgente" })).toBeDisabled();
  await dialog.getByRole("radio", { name: "Agendar" }).check();
  await dialog.getByLabel("Data e hora (fuso de Cuiabá)").fill("2020-01-01T08:00");
  await dialog.getByRole("button", { name: "Confirmar agendamento" }).click();
  await expect(dialog.getByRole("alert")).toHaveText("Escolha um horário futuro");

  const next = new Date(Date.now() + 3 * 86_400_000);
  const local = `${next.toISOString().slice(0, 10)}T09:30`;
  await dialog.getByLabel("Data e hora (fuso de Cuiabá)").fill(local);
  await dialog.getByRole("button", { name: "Confirmar agendamento" }).click();
  await expect(page.getByRole("status").filter({ hasText: "agendada" })).toContainText("9h30");
});

test("checklist incompleto deixa Publicar desabilitado com motivo", async ({ page }) => {
  await loginAs(page, "marina");
  await page.goto("/estudio/materias/c2000000-0000-4000-8000-000000000023");
  await expect(page.getByRole("button", { name: "Publicar", exact: true })).toBeDisabled();
  await expect(page.getByText(/Publicação indisponível: Falta/)).toBeVisible();
});
