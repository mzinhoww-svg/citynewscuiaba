import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { createArticle, loginAs, removeArticles, service, tag } from "./studio";

/*
 * Publicação e agendamento (E06 · P4-T5, Review Focus 5): horário passado é recusado com
 * mensagem; agendar com checklist completo deixa a matéria agendada; push não sai daqui.
 */
const created: string[] = [];
const media: string[] = [];
test.afterAll(async () => {
  await removeArticles(created);
  if (media.length) await service().from("media_assets").delete().in("id", media);
});

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
  // Editora-chefe pode pedir push urgente e já o aprova na mesma ação (A09, A-128).
  await expect(dialog.getByText(/Cria e aprova o aviso urgente/)).toBeVisible();
  await expect(dialog.getByRole("checkbox", { name: "Push urgente" })).toBeEnabled();
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

test("texto alternativo da imagem no editor libera a publicação @a11y", async ({ page }) => {
  const t = tag();
  const id = await createArticle({
    title: `Festival de viola no Porto ${t}`,
    section_slug: "cultura",
    status: "in_review",
    tags: ["música"],
    neighborhoods: ["porto"],
    seo_title: "Festival de viola no Porto",
    seo_description: "Violeiros de Cuiabá se apresentam na orla do Porto no fim de semana.",
  });
  created.push(id);
  const db = service();
  const { data: m, error } = await db
    .from("media_assets")
    .insert({
      kind: "original",
      storage_path: `original/e2e-alt-${t}.jpg`,
      license: "CityNews",
      credit: `Foto: Redação ${t}`,
      allowed_use: "editorial",
      status: "approved",
    })
    .select("id")
    .single();
  if (error) throw error;
  media.push(m.id);
  await db
    .from("article_media")
    .insert({ article_id: id, media_id: m.id, rationale: "e2e", chosen_by: "e2e" });

  await loginAs(page, "marina");
  await page.goto(`/estudio/materias/${id}`);
  await expect(page.getByRole("button", { name: "Publicar", exact: true })).toBeDisabled();
  await expect(
    page.getByText("Publicação indisponível: Falta texto alternativo da imagem"),
  ).toBeVisible();

  const form = page.getByRole("form", { name: `Foto: Redação ${t}` });
  await form.getByRole("button", { name: "Salvar texto da imagem" }).click();
  await expect(form.getByRole("alert")).toHaveText(
    "Escreva o texto alternativo ou marque a imagem como decorativa",
  );
  await form
    .getByLabel("Texto alternativo", { exact: true })
    .fill("Violeiro toca na orla do Porto ao entardecer");
  await form.getByLabel("Legenda (opcional)").fill("Festival de viola no Porto");
  await form.getByRole("button", { name: "Salvar texto da imagem" }).click();
  await expect(form.getByRole("status")).toHaveText("Texto da imagem salvo");
  await expect(page.getByRole("button", { name: "Publicar", exact: true })).toBeEnabled();

  const r = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(r.violations).toEqual([]);

  const { data: link } = await db
    .from("article_media")
    .select("alt, caption")
    .eq("article_id", id)
    .single();
  expect(link).toEqual({
    alt: "Violeiro toca na orla do Porto ao entardecer",
    caption: "Festival de viola no Porto",
  });
});
