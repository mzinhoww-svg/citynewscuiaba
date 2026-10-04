import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { hasMailbox, lastLinkFor } from "./mailbox";
import { loginAs, service, STAFF, tag } from "./studio";

/*
 * P5-T8 · Administração (A01–A06): convidar pessoa mostra "Convite pendente" e manda o link;
 * conceder admin registra o pedido `role.admin` e a admin aprova e aplica na mesma ação (A-128);
 * mesclar tags duplicadas
 * preserva vínculos; reordenar módulos da home por teclado (Alt + setas) e publicar.
 * Mutações só no projeto desktop e cada teste restaura o que criou.
 */

test("A01/A03 · painel e matriz de permissões", async ({ page }) => {
  await loginAs(page, "helena", "/estudio/admin");
  await expect(page.getByRole("heading", { level: 1, name: "Administração" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Pessoas na equipe/ })).toBeVisible();
  await page.goto("/estudio/admin/papeis");
  const matrix = page.getByRole("table", { name: "Matriz de permissões por papel" });
  await expect(matrix.getByRole("rowheader", { name: "users.manage" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Administração", level: 3 })).toBeVisible();
});

test("editora-chefe não entra em Usuários, mas entra em Taxonomia", async ({ page }) => {
  await loginAs(page, "marina");
  await page.goto("/estudio/admin/usuarios");
  await expect(page).toHaveURL(/\/entrar\?next=.*motivo=sem-permissao/);
  await page.goto("/estudio/admin/taxonomia");
  await expect(page.getByRole("heading", { level: 1, name: "Taxonomia" })).toBeVisible();
});

test("A02 · convidar pessoa envia link e aparece como convite pendente", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "cria conta: só no projeto desktop");
  const mark = tag();
  const email = `convite-e2e-${mark}@exemplo.com`;
  const db = service();
  try {
    await loginAs(page, "helena", "/estudio/admin/usuarios");
    await page.getByRole("button", { name: "Convidar pessoa" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Nome").fill(`Pessoa ${mark}`);
    await dialog.getByLabel("E-mail").fill(email);
    await dialog.getByLabel("Papel").selectOption("jornalista");
    await dialog.getByRole("button", { name: "Enviar convite" }).click();
    await expect(page.getByRole("status")).toContainText(`Convite enviado para ${email}`);
    const row = page.getByRole("row").filter({ hasText: `Pessoa ${mark}` });
    await expect(row).toContainText("Convite pendente");
    await expect(row).toContainText("Jornalista");
    if (hasMailbox()) expect(await lastLinkFor(email)).toMatch(/verify/);
  } finally {
    const { data } = await db.auth.admin.listUsers({ perPage: 500 });
    for (const u of data?.users ?? []) {
      if (u.email !== email) continue;
      await db.from("user_roles").delete().eq("user_id", u.id);
      await db.from("profiles").delete().eq("id", u.id);
      await db.auth.admin.deleteUser(u.id);
    }
  }
});

test("A03 · admin concede admin numa ação só; o pedido role.admin fica no histórico (A-128)", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "desktop", "muda papéis do seed: só no projeto desktop");
  const db = service();
  try {
    await loginAs(page, "helena", "/estudio/admin/usuarios");
    const row = page.getByRole("row").filter({ hasText: "Thiago Moraes" });
    await row.getByRole("button", { name: "Editar papéis" }).click();
    const dialog = page.getByRole("dialog", { name: "Papéis de Thiago Moraes" });
    await dialog.getByLabel("Administração").check();
    await dialog.getByLabel(/Justificativa/).fill("Cobrir férias da administração");
    await dialog.getByRole("button", { name: "Salvar papéis" }).click();
    await expect(page.getByRole("status")).toContainText(
      "Papel de administração aplicado. Fica registrado no histórico.",
    );
    const roles = await db
      .from("user_roles")
      .select("role")
      .eq("user_id", STAFF.thiago.id)
      .order("role");
    expect(roles.data?.map((r) => r.role)).toEqual(["admin", "analista"]);
    const { data: ap } = await db
      .from("approvals")
      .select("status, requested_by, approved_by")
      .eq("kind", "role.admin")
      .eq("target_ref", STAFF.thiago.id)
      .single();
    expect(ap).toEqual({
      status: "applied",
      requested_by: STAFF.helena.id,
      approved_by: STAFF.helena.id,
    });
    // O pedido aplicado aparece no histórico da caixa de aprovações.
    await page.goto("/estudio/control/aprovacoes");
    await expect(page.getByRole("table", { name: "Últimas decisões" })).toContainText(
      "Conceder papel de administração",
    );
  } finally {
    await db.from("approvals").delete().eq("kind", "role.admin").eq("target_ref", STAFF.thiago.id);
    await db.from("user_roles").delete().eq("user_id", STAFF.thiago.id).eq("role", "admin");
  }
});

test("A05 · mesclar tags duplicadas preserva vínculos", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "muda tags de matérias: só no projeto desktop");
  const db = service();
  const mark = tag();
  const ids = [randomUUID(), randomUUID()];
  const from = `${mark}-obra`;
  const into = `${mark}-obras`;
  try {
    for (const [i, id] of ids.entries()) {
      const r = await db.from("articles").insert({
        id,
        slug: `e2e-tag-${id.slice(0, 8)}`,
        kind: "original",
        section_slug: "cidade",
        title: "Tag",
        dek: "Linha",
        body: { type: "doc", content: [] },
        status: "draft",
        tags: i === 0 ? [from] : [from, into],
      });
      if (r.error) throw r.error;
    }
    await loginAs(page, "marina", "/estudio/admin/taxonomia");
    const item = page.getByRole("listitem").filter({ hasText: `Mesclar “${into}” em “${from}”` });
    await expect(item).toContainText("plural");
    await item.getByRole("button", { name: "Mesclar" }).click();
    const dialog = page.getByRole("dialog");
    // A pessoa decide: fica com a forma no singular.
    await dialog.getByLabel("Tag que some").selectOption(into);
    await dialog.getByLabel("Tag que fica").selectOption(from);
    await dialog.getByRole("button", { name: "Mesclar" }).click();
    await expect(page.getByRole("status")).toContainText(
      `“${into}” mesclada em “${from}”: 1 vínculo preservado`,
    );
    const rows = await db.from("articles").select("id, tags").in("id", ids);
    for (const r of rows.data ?? []) expect(r.tags).toEqual([from]);
  } finally {
    await db.from("articles").delete().in("id", ids);
  }
});

test("A06 · reordenar módulos da home por teclado (Alt + setas) e publicar", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "desktop", "publica a home: só no projeto desktop");
  const db = service();
  try {
    await loginAs(page, "marina", "/estudio/admin/home");
    const list = page.getByRole("list", { name: "Módulos da home" });
    const first = list.getByRole("listitem").first();
    await expect(first).toHaveAccessibleName(/Assuntos em destaque, posição 1 de 9/);
    await first.focus();
    await page.keyboard.press("Alt+ArrowDown");
    await expect(list.getByRole("listitem").nth(1)).toHaveAccessibleName(
      /Assuntos em destaque, posição 2 de 9/,
    );
    await expect(list.getByRole("listitem").first()).toHaveAccessibleName(
      /Coleções, posição 1 de 9/,
    );
    await page.keyboard.press("Alt+ArrowUp");
    await expect(list.getByRole("listitem").first()).toHaveAccessibleName(
      /Assuntos em destaque, posição 1 de 9/,
    );
    await page.getByRole("button", { name: "Subir Newsletter" }).click();
    await page.getByLabel("Nota da versão").fill("Newsletter antes do panorama (e2e)");
    await page.getByRole("button", { name: "Salvar rascunho" }).click();
    await expect(page.getByRole("status")).toContainText(/Rascunho salvo como versão \d+/);
    await page.getByRole("button", { name: "Publicar", exact: true }).click();
    await expect(page.getByRole("status")).toContainText(/Versão \d+ publicada/);
    const pub = await db
      .from("home_layouts")
      .select("version, modules")
      .eq("status", "published")
      .single();
    expect(pub.data?.version).toBeGreaterThan(1);
    const order = (pub.data?.modules as { id: string }[]).map((m) => m.id);
    expect(order.slice(-2)).toEqual(["newsletter", "panorama"]);
    const hist = page.getByRole("table", { name: "Histórico de versões" });
    await expect(hist.getByRole("row").filter({ hasText: "v1" })).toContainText("Arquivada");
  } finally {
    await db.from("home_layouts").delete().gt("version", 1);
    await db.from("home_layouts").update({ status: "published" }).eq("version", 1);
  }
});
