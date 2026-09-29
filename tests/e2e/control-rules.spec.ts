import { expect, test } from "@playwright/test";
import { loginAs, service, STAFF } from "./studio";

/*
 * P5-T2 · Regras de autonomia (O05, Review Focus 1 e 5): Diego simula com os últimos 7 dias e
 * propõe; a autoaprovação é bloqueada ("A aprovação precisa ser de outra pessoa"); Marina aprova
 * na caixa de aprovações e a versão nova fica ativa. Só no projeto desktop (muda a versão ativa,
 * compartilhada entre projetos) e devolve a v1 do seed no fim.
 */

async function restoreSeedRules(start: number) {
  const db = service();
  await db.from("rules").update({ active: false }).gt("version", 1);
  await db.from("rules").update({ active: true }).eq("version", 1);
  await db.from("rules").delete().gt("version", start);
  await db
    .from("approvals")
    .delete()
    .like("target_ref", "rules:%")
    .in("requested_by", [STAFF.diego.id]);
}

test("regras: leitura da versão ativa e da matriz", async ({ page }) => {
  await loginAs(page, "diego", "/estudio/control/regras");
  await expect(page.getByRole("heading", { level: 1, name: "Regras de autonomia" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: /Versão ativa: v\d+/ })).toBeVisible();
  const matrix = page.getByRole("table", { name: /Regras por categoria da versão/ });
  await expect(matrix.getByRole("rowheader", { name: "Segurança" })).toBeVisible();
  await expect(matrix.getByRole("row").filter({ hasText: "Segurança" })).toContainText("Bloqueada");
  await expect(page.getByRole("table", { name: "Histórico de versões" })).toBeVisible();
});

test("propor, bloquear autoaprovação e aprovar por outra pessoa", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "muda a versão ativa: só no projeto desktop");
  test.setTimeout(90_000);
  const db = service();
  const { data: top } = await db
    .from("rules")
    .select("version")
    .order("version", { ascending: false })
    .limit(1)
    .single();
  const start = top?.version ?? 1;

  try {
    await loginAs(page, "diego", "/estudio/control/regras");
    const min = page.getByRole("spinbutton", { name: "Mín. fontes de Cidade" });
    await min.fill("3");
    await page
      .getByLabel("Justificativa")
      .fill("Cidade com 2 fontes gerou correções: subir para 3.");
    // Propor só depois de simular (Review Focus 5).
    await expect(page.getByRole("button", { name: "Propor versão" })).toBeDisabled();
    await page.getByRole("button", { name: "Simular com os últimos 7 dias" }).click();
    const result = page.getByRole("region", { name: "Resultado da simulação" });
    await expect(result).toContainText(/itens? mudariam? de destino|não tem amostra/);
    await expect(result).toContainText("cidade.minSources: 2 → 3");
    await page.getByRole("button", { name: "Propor versão" }).click();
    await expect(page.getByRole("status")).toContainText(/Versão v\d+ proposta/);

    // Quem propôs vê a faixa e não consegue aprovar.
    await expect(page.getByText(/pedidos? aguardam? segunda aprovação/)).toBeVisible();
    await expect(page.getByText("A aprovação precisa ser de outra pessoa")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Propostas aguardando aprovação" }),
    ).toBeVisible();
    await page.goto("/estudio/control/aprovacoes");
    const mine = page.getByRole("listitem").filter({ hasText: "Cidade com 2 fontes" });
    await expect(mine).toContainText("Seu pedido: A aprovação precisa ser de outra pessoa");
    await expect(mine.getByRole("button", { name: "Revisar" })).toHaveCount(0);

    // Outra pessoa (editora-chefe) aprova e aplica.
    await page.context().clearCookies();
    await loginAs(page, "marina", "/estudio/control/aprovacoes");
    const item = page.getByRole("listitem").filter({ hasText: "Cidade com 2 fontes" });
    await item.getByRole("button", { name: "Revisar" }).click();
    await page.getByRole("button", { name: "Aprovar e aplicar" }).click();
    await expect(page.getByRole("status")).toContainText("Pedido aprovado e aplicado.");
    await expect(page.getByRole("table", { name: "Últimas decisões" })).toContainText("Aplicado");

    const { data: active } = await db
      .from("rules")
      .select("version, approved_by")
      .eq("active", true);
    expect(active).toHaveLength(1);
    expect(active![0]!.version).toBeGreaterThan(start);
    expect(active![0]!.approved_by).toBe(STAFF.marina.id);
    await page.goto("/estudio/control/regras");
    await expect(
      page.getByRole("heading", { level: 2, name: `Versão ativa: v${active![0]!.version}` }),
    ).toBeVisible();
    await expect(
      page
        .getByRole("table", { name: /Regras por categoria/ })
        .getByRole("row")
        .filter({ hasText: "Cidade" }),
    ).toContainText("3");
  } finally {
    await restoreSeedRules(start);
  }
});
