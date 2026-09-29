import { expect, test } from "@playwright/test";
import { loginAs, service, STAFF } from "./studio";

/*
 * Bases, avaliações, custos e governança da IA (P5-T6). Diego (operação de IA) executa a
 * regressão com o provedor falso e vê a execução registrada em nome dele; o histórico mostra o
 * resultado por escrito. Custos mostra o gráfico com resumo em texto e o gasto por agente.
 * Conhecimento e governança são leitura: acervo, fontes, rótulos e chaves. Quem não é da IA
 * (Otávio, editor) é barrado.
 */
const started = new Date();
const callIds: number[] = [];

test.afterAll(async () => {
  const db = service();
  await db
    .from("ai_eval_runs")
    .delete()
    .eq("created_by", STAFF.diego.id)
    .gte("created_at", started.toISOString());
  if (callIds.length > 0) await db.from("ai_calls").delete().in("id", callIds);
});

test("Diego executa a regressão com o provedor falso e o histórico mostra o resultado", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "desktop", "Grava no histórico global: só no desktop.");
  await loginAs(page, "diego", "/estudio/control/avaliacoes");
  await expect(
    page.getByRole("heading", { name: "Avaliações e regressão", level: 1 }),
  ).toBeVisible();
  await expect(page.getByRole("table", { name: /Casos da regressão/ })).toBeVisible();
  await page.getByRole("button", { name: "Executar com o provedor falso" }).click();
  await expect(page.getByRole("status").filter({ hasText: /Regressão executada/ })).toBeVisible();

  await expect(page.getByRole("heading", { name: "Última execução" })).toBeVisible();
  const history = page.getByRole("table", { name: /Execuções da regressão/ });
  await expect(history.getByRole("columnheader", { name: "Precisão" })).toBeVisible();
  await expect(history.getByText("Dentro dos limites").first()).toBeVisible();

  const saved = await service()
    .from("ai_eval_runs")
    .select("provider, case_count, created_by")
    .eq("created_by", STAFF.diego.id)
    .gte("created_at", started.toISOString());
  expect(saved.data).toEqual([{ provider: "fake", case_count: 5, created_by: STAFF.diego.id }]);
});

test("custos: gráfico com resumo em texto, gasto por agente e por modelo", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "desktop", "Grava chamadas de teste: só no desktop.");
  const model = await service().from("ai_agents").select("model_id").eq("id", "write").single();
  const yesterday = new Date(Date.now() - 36 * 3600_000).toISOString();
  const ins = await service()
    .from("ai_calls")
    .insert({
      agent_id: "write",
      model_id: model.data!.model_id,
      ok: true,
      cost_brl: 1.5,
      created_at: yesterday,
    })
    .select("id")
    .single();
  if (ins.error) throw ins.error;
  callIds.push(ins.data.id);

  await loginAs(page, "diego", "/estudio/control/custos");
  await expect(page.getByRole("heading", { name: "Custos e limites", level: 1 })).toBeVisible();
  await expect(page.getByRole("img", { name: /Gasto por dia nos últimos 14 dias/ })).toBeVisible();
  await expect(page.getByText(/Gasto por dia: .*R\$\s?1,50/)).toBeVisible();
  await expect(page.getByRole("table", { name: /contra o orçamento diário/ })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Orçamento do dia" })).toBeVisible();
  await expect(page.getByRole("table", { name: /Gasto por modelo/ })).toBeVisible();
});

test("conhecimento e governança são leitura: acervo, fontes, rótulos e chaves", async ({
  page,
}) => {
  await loginAs(page, "diego", "/estudio/control/conhecimento");
  await expect(
    page.getByRole("heading", { name: "Bases de conhecimento", level: 1 }),
  ).toBeVisible();
  await expect(page.getByRole("table", { name: /Volume do acervo/ })).toBeVisible();
  await expect(page.getByRole("table", { name: /Versão do prompt em produção/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Salvar|Excluir/ })).toHaveCount(0);

  await page.goto("/estudio/control/governanca");
  await expect(page.getByRole("heading", { name: "Governança da IA", level: 1 })).toBeVisible();
  await expect(
    page
      .getByRole("cell", { name: "ORIGINAL CITYNEWS" })
      .or(page.getByRole("rowheader", { name: "ORIGINAL CITYNEWS" })),
  ).toBeVisible();
  await expect(page.getByRole("rowheader", { name: /IA ligada/ })).toBeVisible();
  await expect(page.getByText("IA nunca responde sem fonte")).toBeVisible();
});

test("quem não é da IA é barrado nas quatro telas", async ({ page }) => {
  await loginAs(page, "otavio");
  for (const path of ["conhecimento", "avaliacoes", "custos", "governanca"]) {
    await page.goto(`/estudio/control/${path}`);
    await expect(page).toHaveURL(/motivo=sem-permissao/);
  }
});
