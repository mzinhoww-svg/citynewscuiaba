import { expect, test } from "@playwright/test";
import { loginAs, service, STAFF, tag } from "./studio";

/*
 * Administração (P5-T9): auditoria com IP mascarado (tela e CSV) para quem não é admin, push urgente
 * que só sai com a aprovação de outra pessoa, campanhas com regras fixas e selo, integrações sem
 * segredo, configurações com validação e a guarda por papel. Fluxos que mudam dados globais rodam em
 * série e só no desktop; o mobile é coberto pelo a11y e pelas leituras.
 */
test.describe.configure({ mode: "serial" });

const IP = "203.0.113.77";
const approvalTags: string[] = [];
const campaignNames: string[] = [];
let settingsBefore: { key: string; value: string }[] = [];
let flagBefore = false;

test.beforeAll(async () => {
  const db = service();
  settingsBefore = (await db.from("site_settings").select("key, value")).data ?? [];
  flagBefore =
    (await db.from("feature_flags").select("enabled").eq("key", "sponsored_enabled").single()).data
      ?.enabled ?? false;
});

test.afterAll(async () => {
  const db = service();
  for (const t of approvalTags) {
    const rows =
      (await db.from("approvals").select("id").like("justification", `%${t}%`)).data ?? [];
    const ids = rows.map((r) => r.id);
    if (ids.length) {
      await db.from("push_dispatches").delete().in("approval_id", ids);
      await db.from("approvals").delete().in("id", ids);
    }
  }
  if (campaignNames.length)
    await db.from("sponsored_campaigns").delete().in("advertiser", campaignNames);
  await db.from("feature_flags").update({ enabled: flagBefore }).eq("key", "sponsored_enabled");
  for (const s of settingsBefore)
    await db.from("site_settings").update({ value: s.value }).eq("key", s.key);
});

test("auditoria: IP mascarado na tela e no CSV para quem não é admin, inteiro para admin", async ({
  page,
}, info) => {
  test.skip(info.project.name.startsWith("mobile"), "leitura coberta no desktop e no a11y");
  const ref = `ip-e2e:${tag()}`;
  const ins = await service()
    .from("audit_log")
    .insert({
      actor: "teste-admin-ops",
      action: "article.publish",
      object_ref: ref,
      details: { ip: IP },
      ip_hash: IP,
    });
  expect(ins.error).toBeNull();

  await loginAs(page, "marina", `/estudio/admin/auditoria?objeto=${encodeURIComponent(ref)}`);
  await expect(page.getByRole("heading", { level: 1, name: "Auditoria" })).toBeVisible();
  await expect(
    page.getByText("Endereços de IP aparecem mascarados para o seu papel."),
  ).toBeVisible();
  const row = page.getByRole("row").filter({ hasText: ref });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("203.0.x.x");
  await expect(row).not.toContainText(IP);

  const csv = await page.request.get(
    `/api/admin/auditoria/export?objeto=${encodeURIComponent(ref)}`,
  );
  expect(csv.status()).toBe(200);
  expect(csv.headers()["content-type"]).toContain("text/csv");
  const body = await csv.text();
  expect(body).toContain(ref);
  expect(body).toContain("203.0.x.x");
  expect(body).not.toContain(IP);

  await page.context().clearCookies();
  await loginAs(page, "helena", `/estudio/admin/auditoria?objeto=${encodeURIComponent(ref)}`);
  await expect(page.getByRole("row").filter({ hasText: ref })).toContainText(IP);
  const full = await page.request.get(
    `/api/admin/auditoria/export?objeto=${encodeURIComponent(ref)}`,
  );
  expect(await full.text()).toContain(IP);
});

test("auditoria sem sessão ou sem papel não exporta", async ({ request }) => {
  const r = await request.get("/api/admin/auditoria/export");
  expect(r.status()).toBe(401);
});

test("push urgente: só sai depois que outra pessoa aprova, e cada aprovação vale um envio", async ({
  page,
}, info) => {
  test.skip(info.project.name.startsWith("mobile"), "fluxo que muda dados globais roda no desktop");
  const t = tag();
  approvalTags.push(t);
  const why = `Alagamento na avenida ${t}`;

  await loginAs(page, "otavio", "/estudio/admin/notificacoes");
  await expect(page.getByRole("heading", { level: 1, name: "Notificações" })).toBeVisible();
  const select = page.getByLabel("Matéria", { exact: true });
  const first = select.locator("option").first();
  const title = (await first.textContent())?.trim() ?? "";
  await select.selectOption({ index: 0 });
  await page.getByLabel("Justificativa").fill(why);
  await page.getByRole("button", { name: "Pedir aprovação" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Pedido de aprovação enviado" }),
  ).toBeVisible();
  const pending = page
    .getByRole("row")
    .filter({ hasText: title })
    .filter({ hasText: "Aguarda outra pessoa" });
  await expect(pending.first()).toBeVisible();
  await expect(page.getByRole("button", { name: /^Enviar push:/ })).toHaveCount(0);

  await page.context().clearCookies();
  await loginAs(page, "marina", "/estudio/control/aprovacoes");
  const card = page.getByRole("article").filter({ hasText: why });
  await card.getByRole("button", { name: /^Aprovar:/ }).click();
  await expect(page.getByRole("status").filter({ hasText: "Aprovação registrada." })).toBeVisible();

  await page.context().clearCookies();
  await loginAs(page, "otavio", "/estudio/admin/notificacoes");
  await page
    .getByRole("button", { name: `Enviar push: ${title}` })
    .first()
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Push urgente colocado na fila de envio." }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("row")
      .filter({ hasText: title })
      .filter({ hasText: "Na fila de envio" })
      .first(),
  ).toBeVisible();
  expect(
    (await service().from("push_dispatches").select("id").eq("sent_by", STAFF.otavio.id)).data
      ?.length,
  ).toBeGreaterThan(0);
});

test("publicidade: regras fixas visíveis, Política fora da lista e campanha nasce pausada com o selo", async ({
  page,
}, info) => {
  test.skip(info.project.name.startsWith("mobile"), "fluxo que muda dados globais roda no desktop");
  const name = `Anunciante Fictício ${tag()}`;
  campaignNames.push(name);
  await loginAs(page, "marina", "/estudio/admin/publicidade");
  await expect(
    page.getByRole("heading", { level: 1, name: "Publicidade e patrocinados" }),
  ).toBeVisible();
  await expect(
    page.getByText("No máximo 1 patrocinado a cada 6 cards, e um por lista."),
  ).toBeVisible();
  await expect(page.getByText("Nunca em Política.")).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Política" })).toHaveCount(0);
  await expect(page.getByTestId("ads-flag-state")).toContainText("Desligado");
  await expect(page.getByRole("button", { name: /Ligar patrocínio/ })).toHaveCount(0);

  await page.getByLabel("Anunciante", { exact: true }).fill(name);
  await page.getByLabel("Título da peça").fill("Peça de teste do e2e");
  const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
  await page.getByLabel("Início").fill(day(-1));
  await page.getByLabel("Fim").fill(day(30));
  await page.getByLabel(/Link do anunciante/).fill("https://anunciante.example/e2e");
  await page.getByRole("checkbox").first().check();
  await page.getByRole("button", { name: "Criar campanha" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Campanha salva." })).toBeVisible();
  const row = page.getByRole("row").filter({ hasText: name });
  await expect(row).toContainText("Pausada");
  await expect(row.getByText("PATROCINADO", { exact: true })).toBeVisible();
  await expect(row.getByRole("link", { name: "Peça de teste do e2e" })).toHaveAttribute(
    "href",
    "https://anunciante.example/e2e",
  );
  await row.getByRole("button", { name: `Ativar campanha de ${name}` }).click();
  await expect(page.getByRole("status").filter({ hasText: "Campanha ativada." })).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: name })).toContainText("Ativa");

  // Só o admin liga o patrocínio.
  await page.context().clearCookies();
  await loginAs(page, "helena", "/estudio/admin/publicidade");
  await page.getByRole("button", { name: "Ligar patrocínio" }).click();
  await expect(page.getByTestId("ads-flag-state")).toContainText("Ligado");
  await page.getByRole("button", { name: "Desligar patrocínio" }).click();
  await expect(page.getByTestId("ads-flag-state")).toContainText("Desligado");
});

test("integrações: estado de cada serviço, com os bloqueios, e nenhum segredo na tela", async ({
  page,
}) => {
  await loginAs(page, "diego", "/estudio/admin/integracoes");
  await expect(page.getByRole("heading", { level: 1, name: "Integrações" })).toBeVisible();
  for (const n of ["Supabase", "OpenRouter", "E-mail", "Google (login)", "Vercel"])
    await expect(page.getByRole("rowheader", { name: n })).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: "OpenRouter" })).toContainText("(B-008)");
  await expect(page.getByRole("row").filter({ hasText: "E-mail" })).toContainText("(B-005)");
  await expect(page.getByRole("row").filter({ hasText: "Google (login)" })).toContainText(
    "(B-006)",
  );
  const html = await page.content();
  for (const secret of [
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    process.env.CRON_SECRET,
    process.env.OPENROUTER_API_KEY,
  ])
    if (secret) expect(html).not.toContain(secret);
});

test("configurações: valor inválido é recusado com o campo indicado; válido salva", async ({
  page,
}, info) => {
  test.skip(info.project.name.startsWith("mobile"), "fluxo que muda dados globais roda no desktop");
  await loginAs(page, "helena", "/estudio/admin/configuracoes");
  await page.getByLabel("Push por leitor por dia").fill("11");
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: /Confira os campos.*Push por leitor por dia/ }),
  ).toBeVisible();
  await page.getByLabel("Push por leitor por dia").fill("4");
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Configurações salvas." })).toBeVisible();
  await expect(page.getByLabel("Push por leitor por dia")).toHaveValue("4");
});

test("guarda por papel: jornalista e revisor não entram nas telas de Administração", async ({
  page,
}) => {
  await loginAs(page, "juliana", "/estudio");
  for (const path of ["seguranca", "publicidade", "integracoes", "configuracoes", "auditoria"]) {
    await page.goto(`/estudio/admin/${path}`);
    await expect(page).toHaveURL(/\/entrar\?.*sem-permissao/);
  }
});

test("SEO e segurança mostram só leitura do que existe, sem segredo", async ({ page }) => {
  await loginAs(page, "marina", "/estudio/admin/seo");
  await expect(page.getByRole("heading", { level: 1, name: "SEO" })).toBeVisible();
  await expect(page.getByRole("link", { name: "/sitemap-news.xml" })).toBeVisible();
  await expect(page.getByRole("rowheader", { name: "Bloqueado" })).toBeVisible();
  await page.goto("/estudio/admin/seguranca");
  await expect(
    page.getByRole("heading", { level: 1, name: "Segurança e privacidade" }),
  ).toBeVisible();
  await expect(page.getByText("Só a pessoa administradora libera bloqueios.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Liberar bloqueios" })).toHaveCount(0);
});
