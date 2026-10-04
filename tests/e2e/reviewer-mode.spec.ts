import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { loginAs, service } from "./studio";

/*
 * AUT-T6 · Interruptores: o modo do revisor automático (Desligado, À noite, Sempre) muda com
 * motivo e fica na auditoria. Só o projeto desktop muda o banco; o teste devolve o modo padrão.
 */

test("o admin muda o modo do revisor automático com motivo e vê o estado novo", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "desktop", "muda o modo no banco: só no projeto desktop");
  const db = service();
  try {
    await db.from("ai_reviewer_settings").update({ mode: "night" }).eq("id", true);
    await loginAs(page, "helena", "/estudio/admin/interruptores");
    const card = page.getByRole("region", { name: "Revisor automático" });
    await expect(card).toContainText("À noite");
    await expect(card).toContainText("20h às 6h");
    const blocking = (await new AxeBuilder({ page }).analyze()).violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(blocking).toEqual([]);

    await card.getByRole("button", { name: "Usar o modo Sempre" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Motivo").fill("Cobertura de plantão no fim de semana");
    await dialog.getByRole("button", { name: "Confirmar" }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "Revisor automático: Sempre." }),
    ).toBeVisible();
    await expect(card).toContainText("Sempre");

    const { data } = await db.from("ai_reviewer_settings").select("mode").eq("id", true).single();
    expect(data?.mode).toBe("always");
  } finally {
    await db.from("ai_reviewer_settings").update({ mode: "night" }).eq("id", true);
  }
});

test("editora-chefe não muda o modo do revisor", async ({ page }) => {
  await loginAs(page, "marina");
  await page.goto("/estudio/admin/interruptores");
  await expect(page).toHaveURL(/\/entrar\?next=.*motivo=sem-permissao/);
});
