import { expect, test, type APIRequestContext } from "@playwright/test";
import { localDateKey } from "@/lib/format/date";
import { cronSecret, serviceClient } from "./helpers/pipeline";
import { loginAs } from "./helpers/studio-login";

/**
 * Eventos da Agenda no Estúdio (AGM-T7, spec 2026-10-08 §5.2 e §9). Projeto `fixtures` (next dev
 * com CRAWLER_FIXTURES=1 e AI_PROVIDER=fake): a coleta forçada lê as fontes fictícias sem rede.
 * Cadastrar → aparece em /agenda; editar o título de um evento coletado (Casa Cerrado Vivo,
 * JSON-LD) → nova coleta não sobrescreve; retirar → some de /agenda e /agenda/[slug] dá 404;
 * devolver → volta; quem não tem a editoria Agenda não vê o item nem abre a rota.
 * Em série: muda o banco local; o `afterAll` apaga o que criou.
 */
test.describe.configure({ mode: "serial" });

const TAG = `agm${Date.now().toString(36)}`;
const NEW_TITLE = `Feira do Porto ${TAG}`;
const EDITED_TITLE = `Siriri editado ${TAG}`;
const COLLECTED_SOURCE = "cerrado-vivo";

async function collect(request: APIRequestContext) {
  const res = await request.post("/api/ingest/agenda?force=1", {
    headers: { authorization: `Bearer ${cronSecret()}` },
    timeout: 90_000,
  });
  expect(res.status()).toBe(200);
  expect((await res.json()).status).toBe("done");
}

async function cleanup() {
  const db = serviceClient();
  await db.from("event_listings").delete().like("title", `%${TAG}%`);
  // Eventos de todas as fontes fictícias que a coleta forçada lê (não só a Casa Cerrado Vivo):
  // voltam na próxima coleta, e sem eles as suítes de integração e a agenda pública (agenda.spec,
  // rodado de novo localmente) contam do zero. Os eventos do seed não têm `source_id`.
  await db.from("event_listings").delete().not("source_id", "is", null);
  await db.from("rate_limits").delete().like("bucket", "agenda%");
}

test.beforeAll(async ({ request }) => {
  await serviceClient().from("event_listings").delete().eq("source_id", COLLECTED_SOURCE);
  // Aquece as rotas no `next dev` (compila na primeira requisição).
  for (const path of ["/estudio/agenda", "/estudio/agenda/novo", "/agenda"])
    await request.get(path, { maxRedirects: 0, failOnStatusCode: false }).catch(() => undefined);
});
test.afterAll(cleanup);

/** Dia local de Cuiabá daqui a `days` dias, no formato do campo datetime-local. */
function localInput(days: number, time: string): string {
  return `${localDateKey(new Date(Date.now() + days * 86_400_000))}T${time}`;
}

test("cadastrar, editar coletado sem sobrescrita, retirar e devolver", async ({
  page,
  request,
  baseURL,
}) => {
  test.setTimeout(240_000);
  await loginAs(page.context(), "otavio", baseURL);

  // 1. Cadastro: origem Redação, no ar na hora.
  await page.goto("/estudio/agenda/novo");
  await expect(page.getByRole("heading", { level: 1, name: "Novo evento" })).toBeVisible();
  await page.getByLabel("Nome do evento").fill(NEW_TITLE);
  const day = localInput(10, "19:00");
  await page.getByLabel("Início (fuso de Cuiabá)").fill(day);
  await page.getByLabel("Local", { exact: true }).fill("Praça do Porto");
  await page.getByLabel("Preço em reais").fill("0");
  await page.getByLabel("Categoria").selectOption("feira");
  await page.getByRole("button", { name: "Salvar evento" }).click();
  await expect(page).toHaveURL(/\/estudio\/agenda\/[0-9a-f-]{36}\?feito=criado$/, {
    timeout: 60_000,
  });
  await expect(page.getByRole("status").filter({ hasText: "Evento salvo" })).toBeVisible();
  const created = await serviceClient()
    .from("event_listings")
    .select("id, slug, origin")
    .eq("title", NEW_TITLE)
    .single();
  expect(created.data?.origin).toBe("newsroom");
  const slug = created.data!.slug;

  await page.goto(`/agenda?dia=${day.slice(0, 10)}`);
  await expect(page.getByText(NEW_TITLE).first()).toBeVisible();

  // 2. Evento coletado: editar o título; a coleta seguinte mantém o título editado.
  await collect(request);
  const collected = await serviceClient()
    .from("event_listings")
    .select("id, title, dedupe_key")
    .eq("source_id", COLLECTED_SOURCE)
    .gt("starts_at", new Date(Date.now() + 3_600_000).toISOString())
    .order("starts_at", { ascending: true })
    .limit(1)
    .single();
  expect(collected.data, "a fonte fictícia Casa Cerrado Vivo traz evento futuro").not.toBeNull();
  const target = collected.data!;
  await page.goto(`/estudio/agenda/${target.id}`);
  await expect(page.getByLabel("Nome do evento")).toHaveValue(target.title);
  await page.getByLabel("Nome do evento").fill(EDITED_TITLE);
  await page.getByRole("button", { name: "Salvar evento" }).click();
  await expect(page).toHaveURL(new RegExp(`/estudio/agenda/${target.id}\\?feito=salvo$`), {
    timeout: 60_000,
  });
  await expect(page.getByRole("status").filter({ hasText: "Evento salvo" })).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: /^Nome$/ })).toBeVisible();

  await collect(request);
  const after = await serviceClient()
    .from("event_listings")
    .select("id, title, locked_fields")
    .eq("dedupe_key", target.dedupe_key!);
  expect(after.data).toHaveLength(1);
  expect(after.data?.[0]).toMatchObject({ id: target.id, title: EDITED_TITLE });
  expect(after.data?.[0]?.locked_fields).toEqual(["title"]);

  // 3. Retirar do ar (pela lista filtrada): some de /agenda e a página do evento dá 404.
  await page.goto(`/estudio/agenda?q=${encodeURIComponent(NEW_TITLE)}`);
  const row = page.getByRole("row").filter({ hasText: NEW_TITLE });
  await expect(row).toContainText("No ar");
  await expect(row).toContainText("Redação");
  await row.getByRole("button", { name: `Retirar do ar: ${NEW_TITLE}` }).click();
  await expect(page.getByRole("status").filter({ hasText: "Evento retirado do ar" })).toBeVisible({
    timeout: 30_000,
  });
  await page.goto(`/estudio/agenda?q=${encodeURIComponent(NEW_TITLE)}&situacao=retirado`);
  await expect(page.getByRole("row").filter({ hasText: NEW_TITLE })).toContainText("Retirado");

  await page.goto(`/agenda?dia=${day.slice(0, 10)}`);
  await expect(page.getByText(NEW_TITLE)).toHaveCount(0);
  const gone = await request.get(`/agenda/${slug}`, { failOnStatusCode: false });
  expect(gone.status()).toBe(404);

  // 4. Devolver (pela tela do evento): volta para a agenda pública.
  await page.goto(`/estudio/agenda/${created.data!.id}`);
  await page.getByRole("button", { name: "Devolver ao ar" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Evento de volta ao ar" })).toBeVisible({
    timeout: 30_000,
  });
  await page.goto(`/agenda?dia=${day.slice(0, 10)}`);
  await expect(page.getByText(NEW_TITLE).first()).toBeVisible();
  const back = await request.get(`/agenda/${slug}`, { failOnStatusCode: false });
  expect(back.status()).toBe(200);

  // A auditoria guarda as quatro ações.
  const audit = await serviceClient()
    .from("audit_log")
    .select("action")
    .in("object_ref", [`event:${created.data!.id}`, `event:${target.id}`]);
  expect(new Set(audit.data?.map((a) => a.action))).toEqual(
    new Set(["event.create", "event.update", "event.withdraw", "event.restore"]),
  );
});

test("quem não tem a editoria Agenda não vê o item nem abre a rota", async ({ page, baseURL }) => {
  await loginAs(page.context(), "juliana", baseURL);
  await page.goto("/estudio");
  await expect(page.getByRole("link", { name: "Fila de matérias" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Agenda", exact: true })).toHaveCount(0);
  await page.goto("/estudio/agenda");
  await expect(page).toHaveURL(/\/entrar\?next=%2Festudio%2Fagenda&motivo=sem-permissao/);
  await page.goto("/estudio/agenda/novo");
  await expect(page).toHaveURL(/motivo=sem-permissao/);
});
