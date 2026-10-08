import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { closeStudioMenu, openStudioMenu } from "./helpers/studio-menu";
import { loginAs } from "./helpers/studio-login";
import { service, tag } from "./studio";

/*
 * BELL-T1 · Sino da central de notificações no Estúdio: aparece em todas as páginas, abre com o
 * atalho, lista por severidade, marca como lida; cada papel vê só o que cabe a ele. Também a
 * descoberta do push (item no menu e cartão na home).
 */
const blocking = (impact: string | null | undefined) =>
  impact === "serious" || impact === "critical";

const keys: string[] = [];

async function notify(roles: string[], title: string, severity = "warn") {
  const key = `e2e-bell-${tag()}-${Math.random().toString(36).slice(2, 8)}`;
  keys.push(key);
  const { error } = await service().rpc("studio_notify", {
    p_kind: "approval_pending",
    p_severity: severity,
    p_title: title,
    p_body: "Teste e2e da central",
    p_href: "/estudio/control/aprovacoes",
    p_object_ref: "e2e:bell",
    p_roles: roles,
    p_dedupe: key,
  });
  if (error) throw error;
}

test.afterAll(async () => {
  if (keys.length) await service().from("studio_notifications").delete().in("dedupe_key", keys);
});

const bell = (page: Page) => page.getByRole("button", { name: /^Notificações, / });

test("o sino aparece em todas as páginas do Estúdio e do admin, e marcar como lida baixa o contador", async ({
  page,
}, testInfo) => {
  const title = `Aprovação e2e ${testInfo.project.name} ${tag()}`;
  await notify(["admin"], title);
  await loginAs(page.context(), "helena");
  for (const path of ["/estudio", "/estudio/control", "/estudio/admin/usuarios"]) {
    await page.goto(path);
    await expect(bell(page)).toBeVisible();
  }
  await page.goto("/estudio");
  await expect(bell(page)).toHaveAccessibleName(/\d+ (não lida|não lidas)/);
  const countBefore = Number(
    (await page.getByTestId("bell-count").textContent())?.replace("+", ""),
  );
  await bell(page).click();
  const panel = page.getByRole("dialog", { name: "Central de notificações" });
  await expect(panel).toBeVisible();
  await expect(panel.getByRole("link", { name: new RegExp(title) })).toHaveAttribute(
    "href",
    "/estudio/control/aprovacoes",
  );
  // A marcação é otimista: espera o servidor gravar antes de recarregar (no WebKit o reload cancela
  // o POST em voo, e com o contador em 99+ a checagem abaixo não espera nada).
  const saved = page.waitForResponse(
    (r) => r.url().endsWith("/api/estudio/notificacoes/ler") && r.request().method() === "POST",
  );
  await panel.getByRole("button", { name: `Marcar como lida: ${title}` }).click();
  expect((await saved).ok()).toBe(true);
  await expect(panel.getByRole("button", { name: `Marcar como lida: ${title}` })).toHaveCount(0);
  if (countBefore < 99)
    await expect(page.getByTestId("bell-count")).not.toHaveText(String(countBefore));
  // Continua lida depois de recarregar.
  await page.reload();
  await bell(page).click();
  await page.getByRole("checkbox", { name: "Só não lidas" }).check();
  await expect(page.getByRole("dialog").getByText(title)).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("atalho Alt+N abre e fecha o painel", async ({ page }) => {
  await loginAs(page.context(), "helena");
  await page.goto("/estudio");
  await expect(bell(page)).toBeVisible();
  await page.keyboard.press("Alt+n");
  await expect(page.getByRole("dialog", { name: "Central de notificações" })).toBeVisible();
  await page.keyboard.press("Alt+n");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("cada papel vê só o que cabe a ele (leitura não vê a do admin; moderador vê a sua)", async ({
  page,
}, testInfo) => {
  const adminOnly = `So admin ${testInfo.project.name} ${tag()}`;
  const mods = `Para moderacao ${testInfo.project.name} ${tag()}`;
  await notify(["admin"], adminOnly);
  await notify(["moderador"], mods, "urgent");
  await loginAs(page.context(), "paulo");
  await page.goto("/estudio");
  await bell(page).click();
  await expect(page.getByRole("dialog").getByText(adminOnly)).toHaveCount(0);
  await expect(page.getByRole("dialog").getByText(mods)).toHaveCount(0);
  await page.context().clearCookies();
  await loginAs(page.context(), "carlos");
  await page.goto("/estudio");
  await bell(page).click();
  const panel = page.getByRole("dialog");
  await expect(panel.getByText(mods)).toBeVisible();
  await expect(panel.getByText(adminOnly)).toHaveCount(0);
  await expect(panel.getByRole("heading", { level: 3, name: "Urgentes" })).toBeVisible();
  // Moderador não tem ação de push: sem o atalho "Ver push".
  await expect(panel.getByRole("link", { name: "Ver push" })).toHaveCount(0);
});

test("página completa de notificações com filtro por tipo", async ({ page }, testInfo) => {
  const title = `Historico ${testInfo.project.name} ${tag()}`;
  await notify(["admin"], title);
  await loginAs(page.context(), "helena");
  await page.goto("/estudio/notificacoes");
  await expect(
    page.getByRole("heading", { level: 1, name: "Notificações da equipe" }),
  ).toBeVisible();
  await expect(page.getByText(title)).toBeVisible();
  await page.goto("/estudio/notificacoes?tipo=breaker_open");
  await expect(page.getByText(title)).toHaveCount(0);
  await page.goto("/estudio/notificacoes?tipo=approval_pending");
  await expect(page.getByText(title)).toBeVisible();
});

test("push descobrível: item no menu e cartão na home para quem tem ações de push", async ({
  page,
}) => {
  await loginAs(page.context(), "marina");
  await page.goto("/estudio");
  // A-123: no celular o item do menu fica na gaveta.
  const nav = await openStudioMenu(page);
  await expect(nav.getByRole("link", { name: /^Notificações push/ })).toBeVisible();
  await closeStudioMenu(page);
  const card = page.getByRole("region", { name: "Notificações push" });
  await expect(card).toBeVisible();
  await expect(card.getByText("Na fila")).toBeVisible();
  await expect(card.getByText("Aguardando aprovação")).toBeVisible();
  await expect(card.getByText("Última entrega")).toBeVisible();
  await expect(card.getByRole("button", { name: "Ativar urgências" })).toBeVisible();
  await bell(page).click();
  await expect(page.getByRole("link", { name: "Ver push" })).toHaveAttribute(
    "href",
    "/estudio/admin/notificacoes",
  );
  await page.context().clearCookies();
  await loginAs(page.context(), "juliana");
  await page.goto("/estudio");
  const navJ = await openStudioMenu(page);
  await expect(navJ).toBeVisible();
  await expect(navJ.getByRole("link", { name: /^Notificações push/ })).toHaveCount(0);
  await closeStudioMenu(page);
  await expect(page.getByRole("region", { name: "Notificações push" })).toHaveCount(0);
});

test("axe: sino aberto e página completa @a11y", async ({ page }, testInfo) => {
  await notify(["admin"], `Axe ${testInfo.project.name} ${tag()}`, "urgent");
  await loginAs(page.context(), "helena");
  await page.goto("/estudio");
  await bell(page).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  const open = await new AxeBuilder({ page }).analyze();
  expect(open.violations.filter((v) => blocking(v.impact))).toEqual([]);
  await page.keyboard.press("Escape");
  await page.goto("/estudio/notificacoes");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const full = await new AxeBuilder({ page }).analyze();
  expect(full.violations.filter((v) => blocking(v.impact))).toEqual([]);
});
