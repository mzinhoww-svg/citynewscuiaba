import { expect, test } from "@playwright/test";
import { loginAs, service, STAFF } from "./studio";

/*
 * P5-T2 · Regras de autonomia (O05, Review Focus 1 e 5): Diego (operador de IA, sem o papel de
 * aprovar) simula com os últimos 7 dias e propõe; o pedido fica na caixa e Marina aprova. A-128:
 * Marina (editora-chefe) propõe e aplica numa ação só, e o histórico registra quem fez. Só no
 * projeto desktop (muda a versão ativa, compartilhada entre projetos) e devolve a v1 do seed.
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
    .in("requested_by", [STAFF.diego.id, STAFF.marina.id]);
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

test("operador propõe e o pedido aguarda; editora-chefe aprova na caixa", async ({
  page,
}, info) => {
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
    await expect(page.getByRole("status")).toContainText("Seu papel não aplica regras");

    // Quem propôs sem o papel de aprovar vê a faixa e não decide.
    await expect(page.getByText(/pedidos? aguardam? aprovação/)).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Propostas aguardando aprovação" }),
    ).toBeVisible();
    await page.goto("/estudio/control/aprovacoes");
    const mine = page.getByRole("listitem").filter({ hasText: "Cidade com 2 fontes" });
    await expect(mine).toContainText("Seu pedido");
    await expect(mine).toContainText("Seu papel não decide este tipo de pedido");
    await expect(mine.getByRole("button", { name: "Revisar" })).toHaveCount(0);

    // A editora-chefe aprova e aplica.
    await page.context().clearCookies();
    await loginAs(page, "marina", "/estudio/control/aprovacoes");
    const item = page.getByRole("listitem").filter({ hasText: "Cidade com 2 fontes" });
    await item.getByRole("button", { name: "Revisar" }).click();
    await page.getByRole("button", { name: "Aprovar e aplicar" }).click();
    await expect(page.getByRole("status")).toContainText("Aplicado. Fica registrado no histórico.");
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

test("A-128: editora-chefe propõe e aplica numa ação só; o histórico registra quem fez", async ({
  page,
}, info) => {
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
    await loginAs(page, "marina", "/estudio/control/regras");
    await page.getByRole("spinbutton", { name: "Mín. fontes de Cidade" }).fill("3");
    await page.getByLabel("Justificativa").fill("Editora-chefe sobe Cidade para 3 fontes.");
    await page.getByRole("button", { name: "Simular com os últimos 7 dias" }).click();
    await expect(page.getByRole("region", { name: "Resultado da simulação" })).toContainText(
      "cidade.minSources: 2 → 3",
    );
    await page.getByRole("button", { name: "Propor versão" }).click();
    await expect(page.getByRole("status")).toContainText(
      /Versão v\d+ aplicada\. Fica registrado no histórico\./,
    );

    const { data: active } = await db
      .from("rules")
      .select("version, proposed_by, approved_by")
      .eq("active", true);
    expect(active).toHaveLength(1);
    expect(active![0]).toMatchObject({
      proposed_by: STAFF.marina.id,
      approved_by: STAFF.marina.id,
    });
    const { data: ap } = await db
      .from("approvals")
      .select("status, requested_by, approved_by")
      .eq("target_ref", `rules:${active![0]!.version}`)
      .single();
    expect(ap).toEqual({
      status: "applied",
      requested_by: STAFF.marina.id,
      approved_by: STAFF.marina.id,
    });
    await page.goto("/estudio/control/aprovacoes");
    await expect(page.getByRole("table", { name: "Últimas decisões" })).toContainText("Aplicado");
  } finally {
    await restoreSeedRules(start);
  }
});
