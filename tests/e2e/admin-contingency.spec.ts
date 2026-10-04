import { expect, test } from "@playwright/test";
import { loginAs, service } from "./studio";

/*
 * P5-T10 · Contingência (A15): botões com confirmação digitando o nome da ação, motivo e
 * registro. Só no projeto desktop (as flags são globais) e restaura o seed no fim
 * (auto_publish=false, read_only=false, ai_enabled=true).
 */

async function flag(key: string) {
  const { data } = await service().from("feature_flags").select("enabled").eq("key", key).single();
  return data?.enabled;
}

// Os testes deste arquivo mudam flags globais: em série, num só worker (os dois projetos
// continuam em paralelo, mas só o desktop muta), e cada um restaura só o que mexeu.
test.describe.configure({ mode: "serial" });

async function restoreAi() {
  await service().from("feature_flags").update({ enabled: true }).eq("key", "ai_enabled");
}

async function restoreReadOnly() {
  const db = service();
  await db
    .from("feature_flags")
    .update({ enabled: false })
    .in("key", ["auto_publish", "read_only"]);
  await db
    .from("approvals")
    .delete()
    .eq("target_ref", "flag:auto_publish=true")
    .eq("status", "pending");
}

test("contingência: leitura dos cartões e estado atual", async ({ page }) => {
  await loginAs(page, "helena", "/estudio/admin/contingencia");
  await expect(page.getByRole("heading", { level: 1, name: "Contingência" })).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 2, name: "Publicação automática" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Modo leitura" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Busca com IA" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Regras de autonomia" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Runbook" }).first()).toBeVisible();
});

test("editora-chefe não entra na contingência", async ({ page }) => {
  await loginAs(page, "marina");
  await page.goto("/estudio/admin/contingencia");
  await expect(page).toHaveURL(/\/entrar\?next=.*motivo=sem-permissao/);
});

test("desligar a busca com IA pede o nome da ação; /pergunte oferece a busca tradicional", async ({
  page,
  context,
}, info) => {
  test.skip(info.project.name !== "desktop", "flags globais: só no projeto desktop");
  try {
    await loginAs(page, "helena", "/estudio/admin/contingencia");
    await page.getByRole("button", { name: "Desligar busca com IA" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Motivo").fill("Provedor instável (teste)");
    const confirm = dialog.getByRole("button", { name: "Confirmar" });
    await expect(confirm).toBeDisabled();
    await dialog.getByLabel(/Digite DESLIGAR BUSCA COM IA/).fill("desligar");
    await expect(dialog.getByText("O texto não confere com o nome da ação.")).toBeVisible();
    await expect(confirm).toBeDisabled();
    await dialog.getByLabel(/Digite DESLIGAR BUSCA COM IA/).fill("DESLIGAR BUSCA COM IA");
    await confirm.click();
    await expect(page.getByRole("status")).toContainText("Busca com IA desligada");
    expect(await flag("ai_enabled")).toBe(false);
    await expect(page.getByText(/Desligada: \/pergunte/)).toBeVisible();

    const visitor = await context.browser()!.newPage();
    // Chat (UI-T13): a mensagem do CityNews diz que o assistente está pausado e oferece a busca
    // tradicional, nunca "Tentar de novo".
    await visitor.goto("/pergunte?q=obras+no+CPA");
    await expect(visitor.getByText("Assistente indisponível")).toBeVisible();
    await expect(visitor.getByText(/A redação pausou o assistente/)).toBeVisible();
    await expect(visitor.getByRole("link", { name: "Buscar do jeito tradicional" })).toBeVisible();
    await expect(visitor.getByRole("button", { name: "Tentar de novo" })).toHaveCount(0);
    // Modo simples (sem JS): a busca tradicional logo abaixo (com "Ver todos os resultados"
    // quando há resultado, ou o aviso de vazio) e nunca o botão "Tentar de novo".
    await visitor.goto("/pergunte?q=obras+no+CPA&modo=simples");
    await expect(visitor.getByText("Assistente indisponível")).toBeVisible();
    await expect(
      visitor.getByText(/Resultados da busca tradicional|também não encontrou/),
    ).toBeVisible();
    await expect(visitor.getByRole("link", { name: "Tentar de novo" })).toHaveCount(0);
    await visitor.close();

    await page.getByRole("button", { name: "Ligar busca com IA" }).click();
    await page.getByRole("dialog").getByLabel("Motivo").fill("Provedor estável");
    await page
      .getByRole("dialog")
      .getByLabel(/Digite LIGAR BUSCA COM IA/)
      .fill("LIGAR BUSCA COM IA");
    await page.getByRole("dialog").getByRole("button", { name: "Confirmar" }).click();
    await expect(page.getByRole("status")).toContainText("Busca com IA ligada");
    expect(await flag("ai_enabled")).toBe(true);
  } finally {
    await restoreAi();
  }
});

test("modo leitura bloqueia o Estúdio e a contingência continua valendo", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "desktop", "flags globais: só no projeto desktop");
  try {
    await loginAs(page, "helena", "/estudio/admin/contingencia");
    await page.getByRole("button", { name: "Ativar modo leitura" }).click();
    await page.getByRole("dialog").getByLabel("Motivo").fill("Migração (teste)");
    await page
      .getByRole("dialog")
      .getByLabel(/Digite MODO LEITURA/)
      .fill("MODO LEITURA");
    await page.getByRole("dialog").getByRole("button", { name: "Confirmar" }).click();
    await expect(page.getByRole("status")).toContainText("Modo leitura ligado");
    expect(await flag("read_only")).toBe(true);

    // Retomar publicação automática religa na hora, sem segunda pessoa (A-125), mesmo em modo
    // leitura.
    await page.getByRole("button", { name: "Retomar publicação automática" }).click();
    await page.getByRole("dialog").getByLabel("Motivo").fill("Incidente resolvido (teste)");
    await page
      .getByRole("dialog")
      .getByLabel(/Digite RETOMAR/)
      .fill("RETOMAR PUBLICAÇÃO AUTOMÁTICA");
    await page.getByRole("dialog").getByRole("button", { name: "Confirmar" }).click();
    await expect(page.getByRole("status")).toContainText("Publicação automática religada");
    expect(await flag("auto_publish")).toBe(true);

    await page.getByRole("button", { name: "Sair do modo leitura" }).click();
    await page.getByRole("dialog").getByLabel("Motivo").fill("Migração concluída");
    await page
      .getByRole("dialog")
      .getByLabel(/Digite SAIR DO MODO LEITURA/)
      .fill("SAIR DO MODO LEITURA");
    await page.getByRole("dialog").getByRole("button", { name: "Confirmar" }).click();
    await expect(page.getByRole("status")).toContainText("Modo leitura desligado");
    expect(await flag("read_only")).toBe(false);
  } finally {
    await restoreReadOnly();
  }
});
