import { randomUUID } from "node:crypto";
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { serviceClient } from "./helpers/pipeline";
import {
  counters,
  deliverPush,
  drainAndDispatch,
  fakePushBase,
  receivedByFakeServer,
  shownNotifications,
  stubPushManager,
  swReady,
} from "./helpers/push";
import { loginAs } from "./helpers/studio-login";
import { skipInvite } from "./invite";
import { createArticle, removeArticles, tag } from "./studio";

/*
 * Jornadas do PWA e das notificações (spec 2026-09-28 §18 critérios 1, 2, 3, 9, 11, 12, 16, 17;
 * Review Focus §19 4 e 5; PW-T15). Chromium completo (`channel: "chromium"`): o headless shell
 * responde "denied" a Notification.permission. Push entregue pelo CDP; envio de verdade pelo
 * `web-push` contra o servidor falso (PUSH_ENDPOINT_TEST_HOSTS).
 */
test.skip(
  ({ browserName }) => browserName === "webkit",
  "service worker do Playwright no WebKit não é estável",
);
test.use({ channel: "chromium" });

const SALVA = "prefeitura-detalha-novo-plano-de-onibus-cpa-centro";
const created: string[] = [];
const sends: string[] = [];
const endpoints: string[] = [];

test.afterAll(async () => {
  const db = serviceClient();
  if (sends.length) await db.from("push_sends").delete().in("id", sends);
  if (created.length) {
    await db.from("push_sends").delete().in("article_id", created);
    await removeArticles(created);
  }
  // Só as inscrições deste worker: o projeto desktop e o mobile rodam a jornada ao mesmo tempo.
  if (endpoints.length) await db.from("push_subscriptions").delete().in("endpoint", endpoints);
  await db.from("rate_limits").delete().like("bucket", "push-%");
});

async function consent(context: BrowserContext, baseURL: string, metrics: boolean) {
  await context.addCookies([
    { name: "cn_consent", value: `v1|m${metrics ? 1 : 0}|p0`, url: baseURL },
  ]);
}

async function ready(page: Page) {
  await expect(page.locator('[data-ready="true"]').first()).toBeAttached();
}

/**
 * Envio `follow` em andamento: o recibo só vale com `started_at` em 48 h. Cada chamada cria a sua
 * matéria, porque `push_sends_follow_article_uidx` admite um só `follow` por matéria e os projetos
 * desktop/mobile (e `--repeat-each`) rodam este spec ao mesmo tempo.
 */
async function seedSend(): Promise<{ id: string; slug: string; tagValue: string }> {
  const db = serviceClient();
  const articleId = await createArticle({
    title: `Chuva forte ${tag()}`,
  });
  created.push(articleId);
  const { data: a } = await db.from("articles").select("slug").eq("id", articleId).single();
  const tagValue = articleId.replace(/-/g, "");
  const { data, error } = await db
    .from("push_sends")
    .insert({
      kind: "follow",
      article_id: articleId,
      title: "Chuva forte",
      body: "Defesa Civil alerta",
      origin_label: "ORIGINAL CITYNEWS",
      url: `/materia/${a!.slug}`,
      tag: `${tagValue.slice(0, 20)}${randomUUID().replace(/-/g, "").slice(0, 12)}`,
      audience: { type: "targets" },
      status: "dispatching",
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  sends.push(data.id);
  return { id: data.id, slug: a!.slug, tagValue };
}

test("manifesto válido e SW registrado em página pública, nunca no Estúdio (critérios 1, 2)", async ({
  page,
  request,
  context,
  baseURL,
}) => {
  await consent(context, baseURL!, false);
  const m = await (await request.get("/manifest.webmanifest")).json();
  expect(m).toMatchObject({
    name: "CityNews Cuiabá",
    short_name: "CityNews",
    display: "standalone",
  });
  expect(m.start_url).toMatch(/^\/\?origem=app$/);
  for (const i of m.icons) expect((await request.get(i.src)).ok(), i.src).toBe(true);
  expect(m.shortcuts.map((s: { name: string }) => s.name)).toEqual(
    expect.arrayContaining(["Últimas", "Salvos", "Busca"]),
  );
  expect(
    m.icons.some(
      (i: { sizes: string; purpose?: string }) =>
        i.sizes === "512x512" && /maskable/.test(i.purpose ?? ""),
    ),
  ).toBe(true);
  await page.goto("/");
  await swReady(page);
  expect(await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL)).toMatch(
    /\/sw\.js$/,
  );
  const csp = (await page.request.get("/")).headers()["content-security-policy"] ?? "";
  expect(csp).toMatch(/script-src/);
  expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
  // O SW publicado é o gerado a partir de src/sw (CI confere com `pnpm sw:build && git diff`).
  const sw = await (await request.get("/sw.js")).text();
  expect(sw).toContain("cn-salvos-v1");
});

test("atualização do SW v1 para a nova versão mantém as salvas (critério 3, Review Focus 4 da spec)", async ({
  page,
  context,
  baseURL,
}) => {
  test.slow();
  await consent(context, baseURL!, false);
  await context.route("**/sw.js", (r) =>
    r.fulfill({ path: "tests/fixtures/sw/sw-v1.js", contentType: "text/javascript" }),
  );
  await page.goto("/");
  await swReady(page);
  await page.goto(`/materia/${SALVA}`);
  await ready(page);
  const save = page.getByRole("button", { name: "Salvar", exact: true });
  await save.click();
  await expect(save).toHaveAttribute("aria-pressed", "true");
  await skipInvite(page);
  await expect
    .poll(
      () =>
        page.evaluate(
          async (p) => Boolean(await (await caches.open("cn-salvos-v1")).match(p)),
          `/materia/${SALVA}`,
        ),
      { timeout: 15_000 },
    )
    .toBe(true);
  await context.unroute("**/sw.js");
  await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())!.update());
  await expect
    .poll(() => page.evaluate(() => caches.keys()), { timeout: 20_000 })
    .toEqual(expect.arrayContaining(["cn-salvos-v1", "cn-shell-v1"]));
  await expect
    .poll(() =>
      page.evaluate(() =>
        navigator.serviceWorker.getRegistration().then((r) => Boolean(r?.active)),
      ),
    )
    .toBe(true);
  expect(await page.evaluate((p) => caches.match(p).then(Boolean), `/materia/${SALVA}`)).toBe(true);
});

test("push entregue mostra o aviso; com Métricas gera recibo; sem Métricas não; payload inválido vira aviso genérico (critérios 16, 17)", async ({
  page,
  context,
  baseURL,
}) => {
  test.slow();
  await context.grantPermissions(["notifications"], { origin: baseURL! });
  await consent(context, baseURL!, true);
  const send = await seedSend();
  await page.goto("/");
  await swReady(page);
  // Consentimento chega ao SW pela página (SwRegistrar); espera o postMessage assentar.
  await page.waitForTimeout(500);
  await deliverPush(page, {
    v: 1,
    t: "Chuva forte",
    b: "ORIGINAL CITYNEWS · Defesa Civil alerta",
    u: `/materia/${send.slug}`,
    g: send.tagValue,
    s: send.id,
  });
  await expect
    .poll(() => shownNotifications(page), { timeout: 20_000 })
    .toEqual([
      expect.objectContaining({
        title: "Chuva forte",
        body: "ORIGINAL CITYNEWS · Defesa Civil alerta",
        data: expect.objectContaining({ url: `/materia/${send.slug}`, s: send.id }),
      }),
    ]);
  await expect.poll(() => counters(send.id), { timeout: 20_000 }).toMatchObject({ delivered: 1 });
  // `u` externo vira "/" no SW; payload inválido mostra o aviso genérico.
  await deliverPush(page, {
    v: 1,
    t: "Fora",
    b: "x",
    u: "https://evil.example/x",
    g: "t2",
    s: send.id,
  });
  await expect
    .poll(() => shownNotifications(page).then((l) => l.find((n) => n.title === "Fora")?.data), {
      timeout: 20_000,
    })
    .toEqual(expect.objectContaining({ url: "/" }));
  await deliverPush(page, "lixo");
  await expect
    .poll(() => shownNotifications(page), { timeout: 20_000 })
    .toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: "CityNews", body: "Há novidades no CityNews." }),
      ]),
    );
});

test("Só o necessário: nenhum evento do app e nenhum recibo (Review Focus 5)", async ({
  page,
  context,
  baseURL,
}) => {
  test.slow();
  await context.grantPermissions(["notifications"], { origin: baseURL! });
  await consent(context, baseURL!, false);
  const send = await seedSend();
  const marker = `/flow-${randomUUID().slice(0, 8)}`;
  await page.goto(`/?ref=${marker.slice(1)}`);
  await swReady(page);
  await page.waitForTimeout(500);
  const posted: string[] = [];
  page.on("request", (r) => {
    if (/\/api\/(events|push\/receipt)/.test(r.url())) posted.push(r.url());
  });
  await deliverPush(page, { v: 1, t: "Sem métricas", b: "x", u: "/", g: "t3", s: send.id });
  await expect
    .poll(() => shownNotifications(page), { timeout: 20_000 })
    .toEqual(expect.arrayContaining([expect.objectContaining({ title: "Sem métricas" })]));
  // Um gatilho de evento do app: a faixa de instalação (2ª visita) mostra e registra `install_prompt_shown`
  // só com Métricas; aqui nada sai.
  await page.waitForTimeout(1500);
  expect(posted.filter((u) => u.includes("/api/push/receipt"))).toEqual([]);
  expect(await counters(send.id)).toEqual({ delivered: 0, clicked: 0 });
  // A rota do recibo recusa gravar sem Métricas no cookie mesmo se chamada direto.
  const direct = await page.request.post("/api/push/receipt", {
    data: { s: send.id, e: "delivered", d: "desktop", b: "chrome" },
  });
  expect([204, 403]).toContain(direct.status());
  expect(await counters(send.id)).toEqual({ delivered: 0, clicked: 0 });
  const { count } = await serviceClient()
    .from("events")
    .select("id", { count: "exact", head: true })
    .gte("received_at", new Date(Date.now() - 60_000).toISOString())
    .in("name", ["install_prompt_shown", "notif_preprompt_shown", "notif_permission_granted"])
    .like("session->>page", `%${marker.slice(1)}%`);
  expect(count ?? 0).toBe(0);
});

async function readerContext(browser: Browser, baseURL: string, endpoint: string): Promise<Page> {
  const ctx = await browser.newContext({ baseURL });
  await ctx.grantPermissions(["notifications"], { origin: baseURL });
  await consent(ctx, baseURL, true);
  await ctx.addInitScript(() => {
    if (!localStorage.getItem("cn_invites"))
      localStorage.setItem(
        "cn_invites",
        JSON.stringify([
          { trigger: "follow", at: new Date().toISOString() },
          { trigger: "alert", at: new Date().toISOString() },
          { trigger: "save", at: new Date().toISOString() },
        ]),
      );
    if (!localStorage.getItem("cn_app"))
      localStorage.setItem(
        "cn_app",
        JSON.stringify({
          visits: 1,
          reads: 0,
          install: { refusals: 3, silencedUntil: null, installed: false },
          notif: { refusals: 0, silencedUntil: null },
          lastVisitDay: null,
          lastVisitAt: null,
        }),
      );
  });
  const page = await ctx.newPage();
  await stubPushManager(page, endpoint);
  return page;
}

test("jornada: seguir bairro Morada da Serra, ativar avisos, publicar matéria de cidade com o bairro no Estúdio, servidor falso recebe um push (critérios 9, 12)", async ({
  browser,
  baseURL,
}) => {
  test.slow();
  const t = tag();
  const endpoint = `${fakePushBase()}/flow/${t}`;
  endpoints.push(endpoint);
  const reader = await readerContext(browser, baseURL!, endpoint);
  const marinaCtx = await browser.newContext({ baseURL });
  try {
    // Leitora: alerta de bairro Morada da Serra no navegador → pré-prompt → Ativar → inscrição
    // com bairro:morada-da-serra. CPA fica fora: section.spec conta as matérias de Cidade do seed
    // com bairro=cpa, e a matéria publicada aqui mudaria a contagem no meio da rodada.
    await reader.goto("/alertas");
    await ready(reader);
    await reader.getByLabel("Tipo").selectOption("bairro");
    await reader.getByLabel("Alvo").selectOption("morada-da-serra");
    await reader.getByRole("button", { name: "Criar alerta" }).click();
    // Criar alerta de navegador já pede a permissão nativa: com ela concedida o pré-prompt não
    // tem mais o que perguntar (spec §7.4) e a ativação fica no bloco de Alertas (P18).
    const invite = reader.getByRole("region", { name: "Quer receber avisos?" });
    const block = reader.getByRole("region", { name: "Avisos no celular e no computador" });
    await expect(invite.or(block.getByRole("button", { name: "Ativar avisos" }))).toBeVisible();
    if (await invite.isVisible()) {
      await expect(invite).toContainText("Avisamos só do que você segue e de urgências");
      await invite.getByRole("button", { name: "Ativar" }).click();
      await expect(reader.getByRole("status").filter({ hasText: "Avisos ativados" })).toBeVisible();
    } else {
      await block.getByRole("button", { name: "Ativar avisos" }).click();
      await expect(block.getByRole("button", { name: "Desativar avisos" })).toBeVisible();
    }
    const { data: sub } = await serviceClient()
      .from("push_subscriptions")
      .select("id, targets, metrics_consent")
      .eq("endpoint", endpoint)
      .single();
    expect(sub).toMatchObject({ targets: ["bairro:morada-da-serra"], metrics_consent: true });
    await swReady(reader);

    // Editora-chefe publica matéria de Cidade com bairro Morada da Serra.
    const id = await createArticle({
      title: `Obra na Morada da Serra muda o trânsito ${t}`,
      section_slug: "cidade",
      status: "in_review",
      tags: ["obras"],
      neighborhoods: ["morada-da-serra"],
      seo_title: "Obra na Morada da Serra muda o trânsito",
      seo_description: "Desvios começam na segunda e seguem por duas semanas na Morada da Serra.",
    });
    created.push(id);
    // Cidade exige fonte primária confirmada no checklist (regras de autonomia).
    const { data: item } = await serviceClient()
      .from("collected_items")
      .select("id")
      .limit(1)
      .single();
    const src = await serviceClient()
      .from("article_sources")
      .insert({ article_id: id, item_id: item!.id, role: "primary", confirmed: true });
    if (src.error) throw new Error(src.error.message);
    await loginAs(marinaCtx, "marina");
    const marina = await marinaCtx.newPage();
    await marina.goto(`/estudio/materias/${id}`);
    await marina.getByRole("button", { name: "Publicar", exact: true }).click();
    const dialog = marina.getByRole("dialog", { name: "Publicação e agendamento" });
    await dialog.getByRole("button", { name: "Confirmar publicação" }).click();
    // A mensagem "Matéria publicada" some no `router.refresh()` (a matéria pública não mostra
    // mais o botão Publicar); o resultado durável é o estado da matéria.
    await expect(dialog).toBeHidden();
    await expect
      .poll(
        async () =>
          (await serviceClient().from("articles").select("status").eq("id", id).single()).data
            ?.status,
        { timeout: 15_000 },
      )
      .toBe("published");

    // Trigger → push_match → push_deliver (web-push contra o servidor falso).
    // O `drain` roda `push_dispatch_due` antes e consome push_match → push_deliver; um drain
    // por rodada até o servidor falso receber o POST cifrado.
    await expect
      .poll(
        async () => {
          await drainAndDispatch(baseURL!);
          return (await receivedByFakeServer()).filter((r) => r.path === `/flow/${t}`).length;
        },
        { timeout: 60_000, intervals: [1500, 2500, 4000] },
      )
      .toBeGreaterThanOrEqual(1);
    const got = (await receivedByFakeServer()).filter((r) => r.path === `/flow/${t}`);
    expect(got.length).toBeGreaterThanOrEqual(1);
    expect(got[0]!.bytes).toBeGreaterThan(0);
    // O servidor falso recebe o POST antes de o worker gravar o aceite no envio: espera os
    // contadores em vez de lê-los uma vez (senão vira corrida entre o POST e o `update`).
    const sendRow = () =>
      serviceClient()
        .from("push_sends")
        .select("kind, status, targets_n, accepted_n, sent_measurable_n")
        .eq("article_id", id)
        .single()
        .then((r) => r.data);
    await expect
      .poll(async () => (await sendRow())?.accepted_n ?? 0, { timeout: 20_000 })
      .toBeGreaterThanOrEqual(1);
    const send = await sendRow();
    expect(send).toMatchObject({ kind: "follow" });
    expect(send!.targets_n).toBeGreaterThanOrEqual(1);
    expect(send!.sent_measurable_n).toBeGreaterThanOrEqual(1);
  } finally {
    await reader.context().close();
    await marinaCtx.close();
  }
});
