import { expect, test } from "@playwright/test";
import { createArticle, loginAs, removeArticles, service, tag } from "./studio";

/*
 * AUT-T7 (A10): a situação do assunto (em apuração, confirmado, corrigido, encerrado) aparece só
 * no Estúdio; a matéria pública não mostra nenhum estado.
 */

const articles: string[] = [];
const topics: string[] = [];
test.afterAll(async () => {
  await removeArticles(articles);
  if (topics.length) await service().from("topics").delete().in("id", topics);
});

test("o Estúdio mostra a situação do assunto e a matéria pública não mostra nenhuma", async ({
  page,
}) => {
  const t = tag();
  const db = service();
  const topic = await db
    .from("topics")
    .insert({ slug: `estado-${t}`, title: `Assunto de teste ${t}`, state: "confirmado" })
    .select("id")
    .single();
  if (topic.error) throw topic.error;
  topics.push(topic.data.id);
  const title = `Matéria com assunto ${t}`;
  const id = await createArticle({
    title,
    topic_id: topic.data.id,
    status: "published",
    published_at: new Date().toISOString(),
  });
  articles.push(id);
  const slug = (await db.from("articles").select("slug").eq("id", id).single()).data!.slug;

  await page.goto(`/materia/${slug}`);
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  const text = await page.locator("main").innerText();
  expect(text).not.toMatch(/Situação|Em apuração|Confirmado|Corrigido|Encerrado/);

  await loginAs(page, "marina", `/estudio/materias/${id}`);
  await expect(
    page.getByText(`Assunto: Assunto de teste ${t} · Situação: Confirmado`),
  ).toBeVisible();
});
