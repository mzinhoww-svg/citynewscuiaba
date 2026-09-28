import { expect, test } from "@playwright/test";
import { loginAs, service, STAFF } from "./studio";

/*
 * P5-T6 · IA no Control Center: custos com gráfico e resumo textual, bases de conhecimento,
 * avaliação sob demanda (provedor falso) e governança.
 */

test("custos: gráfico diário com resumo textual e tabela por agente", async ({ page }) => {
  await loginAs(page, "thiago", "/estudio/control/custos");
  await expect(page.getByRole("heading", { level: 1, name: "Custos e limites" })).toBeVisible();
  await expect(
    page.getByRole("img", { name: /Gasto de IA por dia nos últimos 30 dias/ }),
  ).toBeVisible();
  await expect(page.getByText(/^Maior gasto: R\$/)).toBeVisible();
  const agents = page.getByRole("table", { name: /Gasto de IA por agente/ });
  await expect(agents.getByRole("rowheader", { name: "Redação" })).toBeVisible();
  await expect(agents.getByRole("columnheader", { name: "Orçamento/dia" })).toBeVisible();
});

test("custos: papel sem acesso a custos vê a explicação", async ({ page }) => {
  await loginAs(page, "otavio", "/estudio/control/custos");
  await expect(page.getByText(/Seu papel não vê os custos por chamada/)).toBeVisible();
});

test("bases de conhecimento e governança", async ({ page }) => {
  await loginAs(page, "thiago", "/estudio/control/conhecimento");
  const bases = page.getByRole("table", { name: "Bases de conhecimento da IA" });
  await expect(bases.getByRole("rowheader", { name: "Matérias publicadas" })).toBeVisible();
  await expect(page.getByText(/bairros de Cuiabá e Várzea Grande/)).toBeVisible();
  await page.goto("/estudio/control/governanca");
  await expect(page.getByRole("heading", { level: 1, name: "Governança da IA" })).toBeVisible();
  await expect(page.getByText(/A IA nunca responde sem fonte/)).toBeVisible();
  const agents = page.getByRole("table", { name: /Agentes de IA/ });
  await expect(agents.getByRole("row").filter({ hasText: "Busca com IA" })).toContainText("v1");
});

test("avaliações: operador roda a regressão com o provedor falso", async ({ page }) => {
  const start = new Date().toISOString();
  await loginAs(page, "diego", "/estudio/control/avaliacoes");
  await expect(
    page.getByRole("heading", { level: 1, name: "Avaliações e regressão" }),
  ).toBeVisible();
  await expect(page.getByLabel("Versão do prompt")).toHaveValue("1");
  await page.getByRole("button", { name: "Rodar avaliação" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Avaliação concluída" })).toContainText(
    "6 casos, dentro dos limites",
  );
  await expect(page.getByRole("table", { name: /Rodadas de avaliação/ })).toContainText(
    "Falso (teste)",
  );
  await service()
    .from("eval_runs")
    .delete()
    .eq("created_by", STAFF.diego.id)
    .eq("trigger", "manual")
    .gte("created_at", start);
});

test("avaliações: analista só lê", async ({ page }) => {
  await loginAs(page, "thiago", "/estudio/control/avaliacoes");
  await expect(page.getByText("Seu papel vê as avaliações, mas não roda.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Rodar avaliação" })).toHaveCount(0);
  await expect(page.getByRole("table", { name: "Casos de regressão do agente" })).toContainText(
    "viaduto-prazo",
  );
});
