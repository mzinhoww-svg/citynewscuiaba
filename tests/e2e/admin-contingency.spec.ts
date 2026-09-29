import { expect, test, type Page } from "@playwright/test";
import { loginAs, service, STAFF, tag } from "./studio";

/*
 * Contingência (P5-T10): pausar a publicação automática com confirmação digitada, modo leitura que
 * bloqueia uma escrita do Estúdio e libera de volta, e IA fora do ar mostrando "indisponível" em
 * /pergunte com a busca tradicional. Mexe em flags globais: roda sozinha (projeto `global-flags` do
 * playwright.config.ts, depois dos demais) e restaura tudo no `afterAll`.
 */
test.describe.configure({ mode: "serial" });

const KEYS = ["auto_publish", "read_only", "ai_enabled"] as const;
const before = new Map<string, boolean>();
const teams: string[] = [];
const PAGE = "/estudio/admin/contingencia";

test.beforeAll(async () => {
  const r = await service()
    .from("feature_flags")
    .select("key, enabled")
    .in("key", [...KEYS]);
  for (const f of r.data ?? []) before.set(f.key, f.enabled);
  // Ponto de partida conhecido.
  await service().from("feature_flags").update({ enabled: true }).eq("key", "auto_publish");
  await service().from("feature_flags").update({ enabled: false }).eq("key", "read_only");
  await service().from("feature_flags").update({ enabled: true }).eq("key", "ai_enabled");
});

test.afterAll(async () => {
  const db = service();
  for (const [key, enabled] of before)
    await db.from("feature_flags").update({ enabled, updated_by: null }).eq("key", key);
  if (teams.length) await db.from("teams").delete().in("name", teams);
});

/** Abre o diálogo da ação, confere que só habilita com o nome exato e confirma. */
async function confirmAction(
  page: Page,
  button: string,
  title: string,
  typed: string,
  submit: string,
) {
  await page.getByRole("button", { name: button, exact: true }).click();
  const dialog = page.getByRole("dialog", { name: title });
  await expect(dialog).toBeVisible();
  const go = dialog.getByRole("button", { name: submit, exact: true });
  await expect(go).toBeDisabled();
  await dialog.getByLabel("Motivo (fica na auditoria)").fill("Teste e2e de contingência");
  await dialog.getByLabel("Digite o nome da ação para confirmar").fill("nome errado");
  await expect(go).toBeDisabled();
  await dialog.getByLabel("Digite o nome da ação para confirmar").fill(typed);
  await expect(go).toBeEnabled();
  await go.click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });
}

const flagRow = (page: Page, name: string) => page.getByRole("row").filter({ hasText: name });

test("pausar a publicação automática pede o nome digitado, grava quem mudou e audita", async ({
  page,
}, info) => {
  test.skip(info.project.name.startsWith("mobile"), "estado global: só no desktop");
  await loginAs(page, "helena", PAGE);
  await expect(page.getByRole("heading", { level: 1, name: "Contingência" })).toBeVisible();
  await expect(flagRow(page, "Publicação automática")).toContainText("Ligada");

  await confirmAction(
    page,
    "Pausar publicação automática",
    "Pausar publicação automática",
    "pausar publicação automática",
    "Pausar publicação automática",
  );

  await expect(flagRow(page, "Publicação automática")).toContainText("Desligada", {
    timeout: 15_000,
  });
  await expect(flagRow(page, "Publicação automática")).toContainText("Helena");
  await expect(page.getByRole("button", { name: "Retomar publicação automática" })).toBeVisible();

  const db = service();
  const f = await db
    .from("feature_flags")
    .select("enabled, updated_by")
    .eq("key", "auto_publish")
    .single();
  expect(f.data).toEqual({ enabled: false, updated_by: STAFF.helena.id });
  const log = await db
    .from("audit_log")
    .select("actor, details")
    .eq("action", "flag.set")
    .eq("object_ref", "flag:auto_publish")
    .order("id", { ascending: false })
    .limit(1)
    .single();
  expect(log.data?.actor).toBe(STAFF.helena.id);
  expect(log.data?.details).toMatchObject({ value: false, reason: "Teste e2e de contingência" });
});

test("modo leitura bloqueia uma escrita do Estúdio e libera de volta", async ({ page }, info) => {
  test.skip(info.project.name.startsWith("mobile"), "estado global: só no desktop");
  const name = `Equipe contingência ${tag()}`;
  teams.push(name);
  await loginAs(page, "helena", PAGE);

  await confirmAction(
    page,
    "Ativar modo leitura",
    "Ativar modo leitura do Estúdio",
    "ativar modo leitura",
    "Ativar modo leitura",
  );
  await expect(flagRow(page, "Modo leitura do Estúdio")).toContainText("Ligada", {
    timeout: 15_000,
  });

  // Escrita do Estúdio: recusada com a mensagem clara, nada gravado.
  await page.goto("/estudio/admin/equipes");
  await page.getByLabel("Nome da equipe").first().fill(name);
  await page.getByRole("button", { name: "Criar equipe" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "modo leitura" })).toBeVisible();
  expect(
    (await service().from("teams").select("id", { count: "exact", head: true }).eq("name", name))
      .count,
  ).toBe(0);
  // A leitura continua: a página lista as equipes.
  await expect(page.getByRole("heading", { level: 1, name: "Equipes" })).toBeVisible();

  // A tela de contingência não é bloqueada: desliga o modo leitura.
  await page.goto(PAGE);
  await confirmAction(
    page,
    "Desativar modo leitura",
    "Desativar modo leitura",
    "desativar modo leitura",
    "Desativar modo leitura",
  );
  await expect(flagRow(page, "Modo leitura do Estúdio")).toContainText("Desligada", {
    timeout: 15_000,
  });

  await page.goto("/estudio/admin/equipes");
  await page.getByLabel("Nome da equipe").first().fill(name);
  await page.getByRole("button", { name: "Criar equipe" }).click();
  await expect(page.getByText("Equipe criada.")).toBeVisible();
});

test("IA fora do ar: /pergunte mostra indisponível e oferece a busca tradicional", async ({
  page,
}, info) => {
  test.skip(info.project.name.startsWith("mobile"), "estado global: só no desktop");
  await loginAs(page, "helena", PAGE);
  await confirmAction(
    page,
    "IA fora do ar",
    "Desligar a IA globalmente",
    "desligar ia",
    "Desligar a IA",
  );
  await expect(flagRow(page, "IA (global)")).toContainText("Desligada", { timeout: 15_000 });

  // Visitante anônimo (contexto novo, sem sessão): login nunca é obrigatório.
  const anon = await page.context().browser()!.newContext({ locale: "pt-BR" });
  const p = await anon.newPage();
  const res = await p.goto("/pergunte?q=O que aconteceu em Cuiabá hoje?");
  expect(res?.status()).toBe(200);
  await expect(p.getByText("A busca com IA está indisponível no momento")).toBeVisible();
  await expect(p.getByRole("heading", { name: /busca tradicional/i })).toBeVisible();
  await expect(p).not.toHaveURL(/entrar/);
  const api = await p.request.get("/api/ask?q=farm%C3%A1cias");
  expect(api.status()).toBe(200);
  expect(await api.text()).toContain('"aiOff":true');
  await anon.close();

  await page.goto(PAGE);
  await confirmAction(page, "Religar a IA", "Religar a IA", "religar ia", "Religar a IA");
  await expect(flagRow(page, "IA (global)")).toContainText("Ligada", { timeout: 15_000 });
});

test("quem não é admin não acessa a contingência", async ({ page }, info) => {
  test.skip(info.project.name.startsWith("mobile"), "estado global: só no desktop");
  await loginAs(page, "marina", "/estudio");
  await page.goto(PAGE);
  await expect(page).toHaveURL(/sem-permissao|entrar/);
});
