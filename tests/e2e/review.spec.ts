import { expect, test } from "@playwright/test";
import { expectHydrated } from "./helpers/hydration";
import { createArticle, loginAs, removeArticles, service, STAFF, tag } from "./studio";

/*
 * Revisão de item autônomo e editor (E03, E04 · P4-T3): sugestão de IA só com clique humano e
 * origem marcada; Aprovar desabilitado com motivo enquanto o checklist não fecha; decisões com
 * motivo; salvar com versão.
 */
const created: string[] = [];
test.afterAll(() => removeArticles(created));

test("aceitar sugestão de título marca origem IA e autor humano", async ({ page }) => {
  const t = tag();
  const id = await createArticle({
    title: `Rascunho de Juliana ${t}`,
    author_id: STAFF.juliana.id,
  });
  created.push(id);
  await service()
    .from("article_suggestions")
    .insert({
      article_id: id,
      field: "title",
      value: `Moradores cobram iluminação na praça ${t}`,
      agent_id: "write",
      prompt_version: 2,
    });

  await loginAs(page, "juliana");
  await page.goto(`/estudio/materias/${id}`);
  await expectHydrated(page.getByRole("button", { name: "Aplicar título sugerido" }));
  await page.getByRole("button", { name: "Aplicar título sugerido" }).click();
  await expect(page.getByText(/Sugerido pela IA · aceito por Juliana/)).toBeVisible();
  await expect(page.getByLabel("Título", { exact: true })).toHaveValue(
    `Moradores cobram iluminação na praça ${t}`,
  );
  await expect(page.getByText("Nenhuma sugestão aberta.")).toBeVisible();
});

test("salvar rascunho grava nova versão e marca edição humana", async ({ page }) => {
  const t = tag();
  const id = await createArticle({
    title: `Rascunho para salvar ${t}`,
    author_id: STAFF.juliana.id,
  });
  created.push(id);
  await loginAs(page, "juliana");
  await page.goto(`/estudio/materias/${id}`);
  // Sem hidratar, a hidratação devolve o título antigo ao campo e o salvamento não muda nada
  // (versão 2 sem "Editado por", que só aparece para campo alterado).
  await expectHydrated(page.getByLabel("Título", { exact: true }));
  await page.getByLabel("Título", { exact: true }).fill(`Rascunho salvo pela redação ${t}`);
  await page.getByRole("button", { name: "Salvar rascunho" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Rascunho salvo" })).toContainText(
    "versão 2",
  );
  await expect(page.getByText("Editado por Juliana Campos").first()).toBeVisible();
});

test("revisão mostra justificativa, recomendação e Aprovar desabilitado com motivo", async ({
  page,
}) => {
  await loginAs(page, "marina");
  await page.goto("/estudio/fila/c2000000-0000-4000-8000-000000000020");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("ônibus noturnos");
  const justification = page.getByRole("region", { name: "Justificativa da IA", exact: true });
  await expect(justification).toContainText("write");
  await expect(justification).toContainText("v1");
  await expect(page.getByText("Publicar e avisar")).toBeVisible();
  await expect(page.getByRole("button", { name: "Aprovar e publicar" })).toBeDisabled();
  await expect(
    page.getByText(/Aprovar indisponível: Falta fonte primária confirmada/),
  ).toBeVisible();
});

test("rejeitar item autônomo exige motivo e tira da fila", async ({ page }) => {
  const t = tag();
  const id = await createArticle({
    title: `Item do pipeline para rejeitar ${t}`,
    kind: "normalized",
    agent_id: "write",
    status: "in_review",
    review_reason: "Regras mandaram revisar",
  });
  created.push(id);
  await loginAs(page, "marina");
  await page.goto(`/estudio/fila/${id}`);
  await page.getByRole("button", { name: "Rejeitar" }).click();
  await page.getByRole("button", { name: "Confirmar" }).click();
  await expect(page.getByText("Escreva o motivo")).toBeVisible();
  await page.getByLabel("Motivo").fill("Assunto já coberto por matéria original");
  await page.getByRole("button", { name: "Confirmar" }).click();
  await expect(page.getByRole("status").filter({ hasText: "rejeitado" })).toBeVisible();
  const { data } = await service().from("articles").select("status").eq("id", id).single();
  expect(data?.status).toBe("archived");
});

test("jornalista não abre revisão de matéria que não pode editar", async ({ page }) => {
  await loginAs(page, "rafael");
  await page.goto("/estudio/materias/c2000000-0000-4000-8000-000000000023");
  await expect(page.getByText("Seu papel não permite editar esta matéria.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Salvar rascunho" })).toHaveCount(0);
});
