import { expect, test } from "@playwright/test";
import { loginAs, service, STAFF } from "./studio";

/*
 * P5-T5 · Agentes, modelos, prompts versionados e playground (O10, O11, O12, O15).
 * A jornada de publicação muda o prompt em produção do agente `locate` (compartilhado entre
 * projetos): só no projeto desktop, e devolve a v1 do seed no fim.
 */

const AGENT = "locate";

async function restorePrompt() {
  const db = service();
  await db
    .from("ai_prompts")
    .update({ status: "production" })
    .eq("agent_id", AGENT)
    .eq("version", 1);
  await db.from("ai_prompts").delete().eq("agent_id", AGENT).gt("version", 1);
  await db.from("ai_agents").update({ prompt_version: 1 }).eq("id", AGENT);
  await db
    .from("approvals")
    .delete()
    .eq("kind", "prompt.publish")
    .like("target_ref", `prompt:${AGENT}:%`);
}

test("agentes: tabela com orçamento total e link para os prompts", async ({ page }) => {
  await loginAs(page, "thiago", "/estudio/control/agentes");
  await expect(page.getByRole("heading", { level: 1, name: "Agentes" })).toBeVisible();
  await expect(page.getByText(/Orçamentos somam R\$\s?30,00 de R\$\s?30,00/)).toBeVisible();
  const table = page.getByRole("table", { name: /Agentes de IA/ });
  await expect(table.getByRole("rowheader", { name: "Perfil de fonte" })).toBeVisible();
  await expect(page.getByText("Seu papel vê os agentes, mas não edita.")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Salvar/ })).toHaveCount(0);
});

test("modelos: preço por 1k tokens e quem usa", async ({ page }) => {
  await loginAs(page, "thiago", "/estudio/control/modelos");
  await expect(page.getByRole("heading", { level: 1, name: "Modelos" })).toBeVisible();
  const table = page.getByRole("table", { name: /Modelos de IA/ });
  await expect(table.getByRole("row").filter({ hasText: "Gemini 2.5 Flash" })).toContainText(
    "Redação",
  );
  await expect(table.getByRole("columnheader", { name: "R$/1k entrada" })).toBeVisible();
});

test("prompts: agente desconhecido mostra a lista de agentes", async ({ page }) => {
  await loginAs(page, "thiago", "/estudio/control/prompts/nada");
  await expect(
    page.getByRole("heading", { level: 1, name: "Agente não encontrado" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Busca com IA" })).toBeVisible();
});

test("playground: operador roda o agente de classificação com o provedor falso", async ({
  page,
}) => {
  await loginAs(page, "diego", "/estudio/control/testes");
  await expect(page.getByRole("heading", { level: 1, name: "Testar prompts" })).toBeVisible();
  await expect(page.getByText(/Provedor falso/)).toBeVisible();
  await page.getByLabel("Agente").selectOption("classify");
  await page
    .getByLabel("Dados de teste (item colado)")
    .fill("<p>Vacinação contra a gripe nas UPAs de <b>Cuiabá</b> começa na segunda.</p>");
  await page.getByRole("button", { name: "Rodar" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Passou no schema" })).toBeVisible();
  const result = page.getByRole("region", { name: "Resultado" });
  await expect(result).toContainText('"section": "saude"');
  await expect(result).not.toContainText("<p>");
  await expect(result).toContainText("Custo");
});

test("playground: analista só lê", async ({ page }) => {
  await loginAs(page, "thiago", "/estudio/control/testes");
  await expect(page.getByText("Seu papel vê o playground, mas não roda.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Rodar" })).toHaveCount(0);
});

test("prompts: rascunho, pedido de quem não aprova, publicação e rollback", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "desktop", "muda o prompt em produção: só no projeto desktop");
  test.setTimeout(120_000);
  await restorePrompt();
  try {
    await loginAs(page, "diego", `/estudio/control/prompts/${AGENT}`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Prompts de Localidade" }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Em produção: v1" })).toBeVisible();
    await page
      .getByLabel("Texto da nova versão")
      .fill(
        "Você identifica onde o fato acontece: município e bairro. Sem menção explícita, neighborhood=null. Nunca invente bairro.",
      );
    await page.getByLabel("Motivo da mudança").fill("Ordem das instruções mais clara");
    await page.getByRole("button", { name: "Salvar rascunho" }).click();
    await expect(page.getByRole("status")).toContainText("Rascunho v2 salvo.");
    const versions = page.getByRole("table", { name: /Versões do prompt/ });
    await expect(versions.getByRole("row").filter({ hasText: "v2" })).toContainText("Rascunho");

    // Diff contra a produção.
    await page.getByRole("button", { name: "Comparar v2 com a produção" }).click();
    await expect(
      page.getByRole("heading", { level: 2, name: "Diferença entre v1 e v2" }),
    ).toBeVisible();

    // Pedido de publicação: operador de IA não tem o papel de aprovar, o pedido fica aberto.
    await page.getByRole("button", { name: "Pedir publicação da v2" }).click();
    const dialog = page.getByRole("dialog");
    await dialog
      .getByLabel("Justificativa para publicar")
      .fill("Menos bairros inventados no teste");
    await dialog.getByRole("button", { name: "Pedir publicação da v2" }).click();
    await expect(page.getByRole("status")).toContainText("Pedido de publicação registrado");
    await expect(page.getByText("v2 aguarda aprovação de admin ou editor-chefe.")).toBeVisible();
    await expect(page.getByText("Aguarda admin ou editor-chefe.", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Aprovar e publicar v2" })).toHaveCount(0);

    // Editora-chefe aprova e publica na tela do agente.
    await page.context().clearCookies();
    await loginAs(page, "marina", `/estudio/control/prompts/${AGENT}`);
    await page.getByRole("button", { name: "Aprovar e publicar v2" }).click();
    await expect(page.getByRole("status")).toContainText("v2 em produção.");
    await expect(page.getByRole("heading", { level: 2, name: "Em produção: v2" })).toBeVisible();
    await expect(versions.getByRole("row").filter({ hasText: "v1" })).toContainText("Arquivada");

    // Rollback para a v1: cria v3 e marca v2 como revertida.
    await page.getByRole("button", { name: "Voltar para a v1" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Voltar para a v1" }).click();
    await expect(page.getByRole("status")).toContainText("Rollback feito: v3 em produção");
    await expect(versions.getByRole("row").filter({ hasText: "v2" })).toContainText("Revertida");
    await expect(page.getByRole("heading", { level: 2, name: "Em produção: v3" })).toBeVisible();

    const agent = await service()
      .from("ai_agents")
      .select("prompt_version")
      .eq("id", AGENT)
      .single();
    expect(agent.data?.prompt_version).toBe(3);
    const audit = await service()
      .from("audit_log")
      .select("actor, action")
      .in("action", ["prompt.create", "prompt.request", "prompt.publish", "prompt.rollback"])
      .like("object_ref", `prompt:${AGENT}:%`)
      .order("id", { ascending: false })
      .limit(6);
    expect(audit.data).toEqual(
      expect.arrayContaining([
        { actor: STAFF.diego.id, action: "prompt.create" },
        { actor: STAFF.diego.id, action: "prompt.request" },
        { actor: STAFF.marina.id, action: "prompt.publish" },
        { actor: STAFF.marina.id, action: "prompt.rollback" },
      ]),
    );
  } finally {
    await restorePrompt();
  }
});
