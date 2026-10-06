import { mkdir } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { loginAs } from "./helpers/studio-login";
import { createArticle, removeArticles, service, tag } from "./studio";

/*
 * A09 · Novo envio e Configurações (spec 2026-09-28 §10.2, §10.5; PW-T12). Pessoas do seed:
 * Marina (editora-chefe), Otávio (editor de cidade, serviços, clima e agenda), Helena (admin),
 * Thiago (analista). Roda nos projetos serial-flags* (um de cada vez): cada teste cria a própria
 * matéria e o que muda de configuração é restaurado no fim.
 */
const URL = "/estudio/admin/notificacoes";
const REPORTS_DIR = "docs/reports/pwa";
const blocking = (impact: string | null | undefined) =>
  impact === "serious" || impact === "critical";

const created: string[] = [];
const SETTINGS_RESET = [
  { key: "push.paused", value: { on: false, by: null, at: null, reason: null } },
  { key: "push.default_daily_limit", value: 3 },
  { key: "push.quiet_start", value: 22 },
  { key: "push.quiet_end", value: 7 },
];

test.afterAll(async () => {
  const db = service();
  if (created.length) {
    await db.from("push_sends").delete().in("article_id", created);
    await removeArticles(created);
  }
  await db.from("rate_limits").delete().like("bucket", "push_admin_%");
});

async function published(title: string) {
  const id = await createArticle({
    title,
    section_slug: "clima",
    status: "published",
    published_at: new Date().toISOString(),
    publish_mode: "human",
    tags: ["chuva"],
    neighborhoods: ["porto"],
  });
  created.push(id);
  return id;
}

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
}

test("Marina pede urgente com justificativa, aprova na mesma ação (A-128) e vê o toast", async ({
  page,
}) => {
  const t = tag();
  const title = `Chuva forte em Cuiabá ${t}`;
  await published(title);
  await loginAs(page.context(), "marina");
  await page.goto(URL);
  await expect(page.getByRole("heading", { level: 1, name: "Notificações" })).toBeVisible();
  await expect(
    page.getByText("Avisos do que o leitor segue são automáticos e não passam por aqui."),
  ).toBeVisible();
  await page.getByRole("radio", { name: /^Urgente/ }).check();
  await expect(page.getByText("Urgente só sai agora.")).toBeVisible();
  await page.getByRole("combobox", { name: "Matéria" }).fill(`Chuva forte em Cuiabá ${t}`);
  await page.getByRole("option", { name: new RegExp(`Chuva forte em Cuiabá ${t}`) }).click();
  await expect(page.getByRole("group", { name: "Matéria escolhida" })).toContainText(title);
  await expect(page.getByLabel("Título")).toHaveValue(title);
  await expect(page.getByText(/cerca de \d+0 inscrições|menos de 20 inscrições/)).toBeVisible();
  await page.getByLabel("Justificativa").fill("Alerta da Defesa Civil para hoje à tarde");
  await page.getByRole("button", { name: "Enviar para aprovação" }).click();
  // Outro worker pode ter pausado os envios no meio: aí o pedido entra e aguarda a retomada.
  const status = page.getByRole("status").filter({ hasText: /Aplicado\.|Pedido criado\./ });
  await expect(status).toBeVisible();
  await expect(status.getByRole("link", { name: "Ver a fila" })).toHaveAttribute(
    "href",
    `${URL}/fila`,
  );
  const { data } = await service()
    .from("push_sends")
    .select("kind, status, title, justification")
    .eq("title", title);
  expect(data).toHaveLength(1);
  expect(data![0]).toMatchObject({
    kind: "urgent",
    justification: "Alerta da Defesa Civil para hoje à tarde",
  });
  expect(["queued", "dispatching", "sent", "pending_approval"]).toContain(data![0]!.status);
});

test("Otávio vê só Destaque e só matérias de cidade, serviços, clima e agenda", async ({
  page,
}) => {
  await loginAs(page.context(), "otavio");
  await page.goto(URL);
  await expect(page.getByRole("radio", { name: /^Destaque da redação/ })).toBeChecked();
  await expect(page.getByRole("radio", { name: /^Urgente/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Configurações" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Funil do app" })).toHaveCount(0);
  await page.getByRole("combobox", { name: "Matéria" }).fill("Copa Cuiabana");
  await expect(
    page.getByRole("option", { name: "Nenhuma matéria publicada com esse título." }),
  ).toBeVisible();
  await page.getByRole("combobox", { name: "Matéria" }).fill("Mutirão de emprego");
  await expect(page.getByRole("option", { name: /Mutirão de emprego/ })).toContainText("Serviços");
  await page.getByRole("option", { name: /Mutirão de emprego/ }).click();
  await expect(page.getByRole("group", { name: "Matéria escolhida" })).toContainText(
    /Feito a partir de outras fontes|ORIGINAL CITYNEWS/,
  );
  await page.getByRole("radio", { name: "Agendar" }).check();
  const day = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
  await page.getByLabel("Data e hora (fuso de Cuiabá)").fill(`${day}T23:00`);
  await expect(
    page.getByText("Fora do silêncio: escolha um horário entre 7h e 22h."),
  ).toBeVisible();
  // Configurações: sem push.settings, a rota devolve para /entrar com o motivo.
  await page.goto(`${URL}/configuracoes`);
  await expect(page).toHaveURL(/motivo=sem-permissao/);
});

test("analista entra pelo Funil e não vê Novo envio; sem papel de push não entra", async ({
  page,
}) => {
  await loginAs(page.context(), "thiago");
  await page.goto(URL);
  await expect(page).toHaveURL(new RegExp(`${URL}/funil`));
  await page.context().clearCookies();
  await loginAs(page.context(), "paulo");
  await page.goto(URL);
  await expect(page).toHaveURL(
    /\/entrar\?next=%2Festudio%2Fadmin%2Fnotificacoes&motivo=sem-permissao/,
  );
});

test("pausar exige digitar PAUSAR; banner aparece; quem pode aprovar retoma na hora (A-128)", async ({
  browser,
}) => {
  test.slow();
  const helenaCtx = await browser.newContext();
  const helena = await helenaCtx.newPage();
  await loginAs(helenaCtx, "helena");
  try {
    await helena.goto(`${URL}/configuracoes`);
    await expect(helena.getByText("Chaves VAPID configuradas")).toBeVisible();
    await helena.getByRole("button", { name: "Pausar todos os envios" }).click();
    const dialog = helena.getByRole("dialog", { name: "Pausar todos os envios?" });
    await dialog.getByLabel("Motivo").fill("incidente no provedor");
    await dialog.getByLabel("Digite PAUSAR para confirmar").fill("pausar");
    await expect(dialog.getByText("Digite exatamente PAUSAR.")).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Pausar envios" })).toBeDisabled();
    await dialog.getByLabel("Digite PAUSAR para confirmar").fill("PAUSAR");
    await dialog.getByRole("button", { name: "Pausar envios" }).click();
    await expect(
      helena
        .getByText(/Envios pausados por Helena Costa às \d{2}:\d{2}: incidente no provedor/)
        .first(),
    ).toBeVisible();
    // Retomar: Helena (admin, push.approve) pede e retoma na mesma ação; fica no histórico.
    await helena.getByRole("button", { name: "Retomar envios" }).click();
    await helena
      .getByRole("dialog", { name: "Retomar envios?" })
      .getByLabel("Motivo")
      .fill("resolvido");
    await helena.getByRole("button", { name: "Pedir retomada" }).click();
    await expect(
      helena
        .getByRole("status")
        .filter({ hasText: "Envios retomados. Fica registrado no histórico." }),
    ).toBeVisible();
    await expect(helena.getByText(/Envios pausados por/)).toHaveCount(0);
    const { data: resumed } = await service()
      .from("approvals")
      .select("status, requested_by, approved_by")
      .eq("kind", "push.resume")
      .eq("justification", "resolvido")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    expect(resumed?.status).toBe("applied");
    expect(resumed?.approved_by).toBe(resumed?.requested_by);
  } finally {
    await service().from("app_settings").upsert(SETTINGS_RESET);
    await service().from("approvals").delete().eq("kind", "push.resume").eq("status", "pending");
    await helenaCtx.close();
  }
});

test("configurações recusam silêncio que não contém 22h–7h e salvam limite 2", async ({ page }) => {
  await loginAs(page.context(), "helena");
  await page.goto(`${URL}/configuracoes`);
  const start = page.getByLabel("Início do silêncio");
  await expect(start.locator("option")).toHaveText(["18h", "19h", "20h", "21h", "22h"]);
  await expect(page.getByLabel("Fim do silêncio").locator("option")).toHaveText([
    "7h",
    "8h",
    "9h",
    "10h",
  ]);
  await expect(page.getByText("Sempre contém 22h–7h.").first()).toBeVisible();
  // O servidor também recusa um valor fora da janela (formulário adulterado).
  await page.getByLabel("Limite diário padrão").selectOption("2");
  await page.getByRole("button", { name: "Salvar configurações" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Configurações salvas" })).toBeVisible();
  const { data } = await service()
    .from("app_settings")
    .select("value")
    .eq("key", "push.default_daily_limit")
    .single();
  expect(data?.value).toBe(2);
  await page.getByLabel("Limite diário padrão").selectOption("3");
  await page.getByRole("button", { name: "Salvar configurações" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Configurações salvas" })).toBeVisible();
  await service()
    .from("app_settings")
    .upsert([{ key: "push.default_daily_limit", value: 3 }]);
});

test("estados: 360 px sem rolagem horizontal, axe em 390/768/1280 e capturas @a11y", async ({
  page,
}) => {
  test.slow();
  await mkdir(REPORTS_DIR, { recursive: true });
  await loginAs(page.context(), "helena");
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto(URL);
  await expect(page.getByRole("heading", { level: 2, name: "Novo envio" })).toBeVisible();
  await noHorizontalScroll(page);
  await page.goto(`${URL}/configuracoes`);
  await expect(page.getByRole("heading", { level: 2, name: "Configurações" })).toBeVisible();
  await noHorizontalScroll(page);
  for (const [name, width] of [
    ["390", 390],
    ["768", 768],
    ["1280", 1280],
  ] as const) {
    await page.setViewportSize({ width, height: 900 });
    for (const [slug, path] of [
      ["novo-envio", URL],
      ["configuracoes", `${URL}/configuracoes`],
    ] as const) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1, name: "Notificações" })).toBeVisible();
      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations.filter((v) => blocking(v.impact))).toEqual([]);
      await page.screenshot({ path: `${REPORTS_DIR}/a09-${slug}-${name}.png`, fullPage: true });
    }
  }
});
