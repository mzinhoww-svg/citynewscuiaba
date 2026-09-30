import { mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers/studio-login";
import { service } from "./studio";

/*
 * Funil do app (spec 2026-09-28 §10.6; PW-T14): Thiago (analista) só vê o Funil; 7 etapas com
 * número e % da anterior, filtros na URL, blocos laterais e o aviso "não são pessoas". A semente
 * de eventos vive só aqui (service role), nunca em seed.sql.
 */
const URL = "/estudio/admin/notificacoes/funil";
const REPORTS_DIR = "docs/reports/pwa";
const blocking = (impact: string | null | undefined) =>
  impact === "serious" || impact === "critical";
const page = `/funil-e2e-${randomUUID().slice(0, 8)}`;
const ids: number[] = [];

async function seed(name: string, props: Record<string, unknown>, device = "mobile") {
  const now = new Date(Date.now() - 60_000).toISOString();
  const { data, error } = await service()
    .from("events")
    .insert({
      name,
      anon_id: null,
      user_id: null,
      at: now,
      received_at: now,
      session: { id: "-", page, referrer: null, device },
      consent: { version: "v1", metrics: true, personalization: false },
      algo_version: "rec-v1",
      props: { ...props, browser: "chrome" },
    })
    .select("id")
    .single();
  if (error) throw error;
  ids.push(data.id);
}

test.beforeAll(async () => {
  for (let i = 0; i < 3; i++)
    await seed("install_prompt_shown", { platform: "android", trigger: "visits" });
  await seed("app_installed", { via: "prompt" });
  await seed("notif_preprompt_shown", { trigger: "follow" });
  await seed("notif_permission_granted", { trigger: "follow" });
  await seed("notif_permission_granted", { trigger: "settings" });
  await seed("notif_permission_denied", { trigger: "alert" }, "desktop");
});
test.afterAll(async () => {
  if (ids.length) await service().from("events").delete().in("id", ids);
});

test("Thiago (analista) vê só o Funil com 7 etapas, filtros na URL e o aviso 'não são pessoas'", async ({
  page,
}) => {
  await loginAs(page.context(), "thiago");
  await page.goto("/estudio/admin/notificacoes");
  await expect(page).toHaveURL(new RegExp(`${URL}$`));
  await expect(page.getByRole("heading", { level: 2, name: "Funil do app" })).toBeVisible();
  await expect(
    page.getByText("Contagens de eventos de quem permite métricas; não são pessoas."),
  ).toBeVisible();
  // Só o Funil: nenhuma aba de operação.
  await expect(page.getByRole("navigation", { name: "Seções de Notificações" })).toHaveCount(0);
  const table = page.getByRole("table", { name: "Funil do app por etapa" });
  await expect(table.getByRole("rowheader")).toHaveCount(7);
  await expect(table.getByRole("rowheader", { name: "1. Convite de instalação" })).toBeVisible();
  await expect(table.getByRole("rowheader", { name: "7. Tocados" })).toBeVisible();
  await expect(page.getByRole("img", { name: /Funil do app por etapa/ })).toBeVisible();
  await expect(page.getByText(/convites de instalação/)).toBeVisible();
  await expect(page.getByText("Permissões dadas em Alertas")).toBeVisible();
  await expect(page.getByText("Inscrições ativas por navegador")).toBeVisible();
  await page.getByLabel("Período").selectOption("7");
  await page.getByLabel("Classe de aparelho").selectOption("desktop");
  await page.getByRole("button", { name: "Filtrar" }).click();
  await expect(page).toHaveURL(/periodo=7/);
  await expect(page).toHaveURL(/aparelho=desktop/);
  await expect(page.getByLabel("Classe de aparelho")).toHaveValue("desktop");
  // Período antigo sem dados: estado vazio.
  await page.goto(`${URL}?periodo=personalizado&de=2001-01-01&ate=2001-01-07`);
  await expect(page.getByText("Sem dados no período.")).toBeVisible();
  // Editor sem push.metrics não entra.
  await page.context().clearCookies();
  await loginAs(page.context(), "otavio");
  await page.goto(URL);
  await expect(page).toHaveURL(/motivo=sem-permissao/);
});

test("axe em 390/768/1280 e capturas do funil @a11y", async ({ page }) => {
  test.slow();
  await mkdir(REPORTS_DIR, { recursive: true });
  await loginAs(page.context(), "helena");
  for (const [name, width] of [
    ["390", 390],
    ["768", 768],
    ["1280", 1280],
  ] as const) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(URL);
    await expect(page.getByRole("heading", { level: 1, name: "Notificações" })).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.filter((v) => blocking(v.impact))).toEqual([]);
    await page.screenshot({ path: `${REPORTS_DIR}/a09-funil-${name}.png`, fullPage: true });
  }
});
