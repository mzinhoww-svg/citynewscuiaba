import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { loginAs, service, STAFF } from "./studio";

/*
 * P5-T7 · Recomendação (O17/O18, Review Focus 2): pesos que somam 0,99 travam o "Propor" com a
 * soma exibida; proposta abre pedido e quem propõe não ativa; admin ativa; teste A/B com
 * métricas por variante e "Por que esta recomendação" por anonId. A jornada muda os pesos ativos
 * (compartilhados entre projetos): só no desktop, restaurando rec-v1 no fim.
 */

const MARK = `e2e-rec-${randomUUID().slice(0, 6)}`;

async function restoreWeights() {
  const db = service();
  await db.from("rec_experiments").delete().like("name", `${MARK}%`);
  await db.from("rec_weights").update({ active: false }).neq("version", "rec-v1");
  await db.from("rec_weights").update({ active: true }).eq("version", "rec-v1");
  await db.from("rec_weights").delete().like("version", "rec-v%").neq("version", "rec-v1");
  await db.from("approvals").delete().eq("kind", "rec.weights");
}

test("painel: indicadores, pesos ativos e histórico para quem só lê", async ({ page }) => {
  await loginAs(page, "thiago", "/estudio/control/recomendacao");
  await expect(
    page.getByRole("heading", { level: 1, name: "Recomendação de fontes" }),
  ).toBeVisible();
  await expect(page.getByText("Versão do algoritmo").first()).toBeVisible();
  await expect(
    page.getByText("Seu papel vê o painel, mas não altera pesos, campanhas nem testes."),
  ).toBeVisible();
  const history = page.getByRole("table", { name: /Versões de pesos/ });
  await expect(history.getByRole("rowheader", { name: "rec-v1" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Propor pesos" })).toHaveCount(0);
});

test("pesos: soma 0,99 desabilita o propor e mostra a soma (Review Focus 2)", async ({ page }) => {
  await loginAs(page, "diego", "/estudio/control/recomendacao");
  const diversity = page.getByRole("spinbutton", { name: "Peso de Diversidade" });
  await expect(page.getByRole("button", { name: "Propor pesos" })).toBeDisabled();
  await diversity.fill("0.04");
  await expect(page.getByText(/Soma: 0,990/)).toBeVisible();
  await expect(page.getByText(/A soma precisa ficar em 1,00/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Propor pesos" })).toBeDisabled();
  await page.getByRole("spinbutton", { name: "Peso de Popularidade" }).fill("0.36");
  await expect(page.getByText(/Soma: 1,000/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Propor pesos" })).toBeEnabled();
});

test("Por que esta recomendação: anonId vira pseudônimo e individual pesa 0 sem consentimento", async ({
  page,
}) => {
  await loginAs(page, "diego", "/estudio/control/recomendacao");
  await page.getByLabel("anonId do leitor").fill("nao-e-uuid");
  await page.getByRole("button", { name: "Explicar" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Informe um anonId válido" }),
  ).toBeVisible();
  const anon = randomUUID();
  await page.getByLabel("anonId do leitor").fill(anon);
  await page.getByRole("button", { name: "Explicar" }).click();
  await expect(page.getByText(/^Leitor [0-9a-f]{10} · rec-v/)).toBeVisible();
  await expect(page.getByText(anon)).toHaveCount(0);
  await expect(page.getByText(/^Sem consentimento \(ou sem eventos\)/)).toBeVisible();
  const table = page.getByRole("table", { name: "Componentes do score por fonte" });
  await expect(table.getByRole("rowheader", { name: "Folha do Cerrado" })).toBeVisible();
  await expect(table.getByText("Individual: peso 0,00 × sinal 0,00").first()).toBeVisible();
});

test("operador propõe e a política ativa (A-150); admin propõe e ativa direto; teste A/B", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "desktop", "muda os pesos ativos: só no projeto desktop");
  test.setTimeout(120_000);
  await restoreWeights();
  try {
    // Operador de IA: validar → simular → ativar → auditar, sem fila (motor de política).
    await loginAs(page, "diego", "/estudio/control/recomendacao");
    await page.getByRole("spinbutton", { name: "Peso de Diversidade" }).fill("0.1");
    await page.getByRole("spinbutton", { name: "Peso de Popularidade" }).fill("0.3");
    await page.getByLabel("Justificativa da proposta").fill(`${MARK}: mais diversidade`);
    await page.getByRole("button", { name: "Propor pesos" }).click();
    await expect(
      page.getByRole("status").filter({ hasText: /Fica registrado no histórico/ }),
    ).toContainText(/rec-v\d+ em uso\./);
    await expect(page.getByText(/^Pesos ativos: rec-v[2-9]\d*/)).toBeVisible();
    const active = await service().from("rec_weights").select("version").eq("active", true);
    expect(active.data?.[0]?.version).not.toBe("rec-v1");

    await page.context().clearCookies();
    await loginAs(page, "helena", "/estudio/control/recomendacao");
    // A-128: a admin propõe e ativa numa ação só; a linha guarda quem propôs e quem aprovou.
    await page.getByRole("spinbutton", { name: "Peso de Diversidade" }).fill("0.05");
    await page.getByRole("spinbutton", { name: "Peso de Popularidade" }).fill("0.35");
    await page.getByLabel("Justificativa da proposta").fill(`${MARK}: volta ao padrão`);
    await page.getByRole("button", { name: "Propor pesos" }).click();
    // Duas regiões de status (formulário de proposta e histórico): a da proposta é a que conta.
    await expect(
      page.getByRole("status").filter({ hasText: /Fica registrado no histórico/ }),
    ).toContainText(/rec-v\d+ em uso\. Fica registrado no histórico\./);
    const own = await service()
      .from("rec_weights")
      .select("version, proposed_by, approved_by")
      .eq("active", true)
      .single();
    expect(own.data).toMatchObject({
      proposed_by: STAFF.helena.id,
      approved_by: STAFF.helena.id,
    });

    // Teste A/B entre rec-v1 (aprovada) e a nova versão.
    await page.getByLabel("Nome", { exact: true }).nth(1).fill(`${MARK} diversidade`);
    await page.getByRole("button", { name: "Criar teste" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Teste" })).toContainText("criado");
    await page.getByRole("link", { name: `${MARK} diversidade` }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: `Teste A/B: ${MARK} diversidade` }),
    ).toBeVisible();
    const variants = page.getByRole("table", {
      name: "Variantes do teste com alocação e métricas",
    });
    await expect(variants.getByRole("rowheader", { name: "controle" })).toBeVisible();
    await expect(variants.getByRole("row").filter({ hasText: "variante-1" })).toContainText("50%");
    await expect(page.getByText("Sem eventos com o rótulo deste teste ainda.")).toBeVisible();
    await page.getByRole("button", { name: "Encerrar teste" }).click();
    await expect(page.getByRole("status")).toContainText("Teste encerrado.");
    await expect(page.getByText(/Situação: Encerrado/)).toBeVisible();

    const audit = await service()
      .from("audit_log")
      .select("actor, action")
      .in("action", [
        "rec.weights",
        "rec.weights.activate",
        "rec.experiment.create",
        "rec.experiment.end",
      ])
      .order("id", { ascending: false })
      .limit(6);
    expect(audit.data).toEqual(
      expect.arrayContaining([
        // Cada proposta é validada e ativada pelo sistema na mesma ação (A-150).
        { actor: STAFF.diego.id, action: "rec.weights" },
        { actor: STAFF.helena.id, action: "rec.weights" },
        { actor: STAFF.helena.id, action: "rec.experiment.create" },
        { actor: STAFF.helena.id, action: "rec.experiment.end" },
      ]),
    );
  } finally {
    await restoreWeights();
  }
});
