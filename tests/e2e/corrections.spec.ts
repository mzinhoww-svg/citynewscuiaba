import { expect, test } from "@playwright/test";
import { createArticle, loginAs, removeArticles, service, tag } from "./studio";

/*
 * Correções e calendário (E07, E08 · P4-T6): revisor publica correção com nota pública e aviso
 * a quem salvou; a nota aparece em /correcoes; calendário mostra a agendada.
 */
const created: string[] = [];
test.afterAll(async () => {
  const db = service();
  await db.from("corrections").delete().in("article_id", created);
  await removeArticles(created);
});

test("revisor publica correção com nota pública e ela aparece em /correcoes", async ({ page }) => {
  const t = tag();
  const id = await createArticle({
    title: `Feira livre muda de dia ${t}`,
    status: "published",
    publish_mode: "human",
    published_at: new Date(Date.now() - 7_200_000).toISOString(),
  });
  created.push(id);
  const { data: c } = await service()
    .from("corrections")
    .insert({ article_id: id, kind: "correction", public_note: "", requested_by: "leitor" })
    .select("id")
    .single();

  await loginAs(page, "beatriz", "/estudio/correcoes");
  await page.getByRole("link", { name: `Feira livre muda de dia ${t}` }).click();
  await expect(page).toHaveURL(new RegExp(`/estudio/correcoes/${c!.id}`));
  await page.getByLabel("Linha fina").fill("A feira passa para as quintas-feiras.");
  await page.getByRole("button", { name: "Publicar correção" }).click();
  await expect(page.getByText("Escreva a nota pública da correção")).toBeVisible();
  const note = `A feira passa para as quintas, não para as quartas ${t}.`;
  await page.getByLabel("Nota pública").fill(note);
  await page.getByRole("button", { name: "Publicar correção" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Correção publicada" })).toBeVisible();
  await expect(page.getByText(`Nota pública: ${note}`)).toBeVisible();

  await page.goto("/correcoes");
  await expect(page.getByText(note)).toBeVisible();
});

test("calendário mostra a matéria agendada da semana", async ({ page }) => {
  await loginAs(page, "marina", "/estudio/calendario");
  await expect(page.getByRole("heading", { level: 1, name: "Calendário editorial" })).toBeVisible();
  await expect(page.getByRole("link", { name: /vacinação contra a gripe/ })).toBeVisible();
  await page.getByRole("link", { name: "Próximos 7 dias" }).click();
  await expect(page).toHaveURL(/semana=\d{4}-\d{2}-\d{2}/);
});
