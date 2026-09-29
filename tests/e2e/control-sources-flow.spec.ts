import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import {
  collectedCount,
  cronSecret,
  drain,
  failFetchTimes,
  fastTick,
  ingestStatus,
  notificationsFor,
  resetFetchState,
  serviceClient,
  sourceState,
} from "./helpers/pipeline";
import { loginAs, type StaffKey } from "./helpers/studio-login";

/**
 * Jornadas completas do painel de fontes (FS-T9, spec §7.1–§7.8, §12). Roda só no projeto
 * `fixtures` (next dev com CRAWLER_FIXTURES=1 e AI_PROVIDER=fake, sem rede), depois dos projetos
 * desktop/mobile, e em série: cada teste muda o banco compartilhado (cadastra o Jornal da Chapada,
 * bloqueia o Diário da Baixada, rebaixa a Agência Cerrado, põe a Folha do Cerrado na via rápida).
 * `pnpm db:reset` devolve o estado inicial. Os ajudantes de `helpers/pipeline.ts` usam a service
 * role e o CRON_SECRET só aqui, nos testes.
 */
test.describe.configure({ mode: "serial" });

const BASE = "/estudio/control/fontes";
const SEED = {
  folha: "c5000000-0000-4000-8000-000000000001", // ativa, RSS (pausada em lote pelo spec da lista)
  diario: "c5000000-0000-4000-8000-000000000002", // ativa, no Panorama da home
  agencia: "c5000000-0000-4000-8000-000000000010", // ativa, no Panorama da home
} as const;
const PANORAMA = "Veja também em outros portais";

async function enter(page: Page, who: StaffKey, baseURL: string | undefined) {
  await loginAs(page.context(), who, baseURL);
}

async function axeClean(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  const bad = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual(
    [],
  );
}

/** Retoma (ou ativa) uma fonte pausada pelo cabeçalho do detalhe; sem efeito se já está ativa. */
async function ensureActive(page: Page, id: string) {
  await page.goto(`${BASE}/${id}`);
  const resume = page.getByRole("button", { name: /^(Retomar|Ativar)$/ });
  if (await resume.isVisible()) {
    await resume.click();
    await expect(page.getByRole("status")).toContainText(/Fonte (retomada|ativada)/);
  }
  await expect(page.getByText("Ativa", { exact: true }).first()).toBeVisible();
}

test("cadastrar pela seção sem feed, ativar, coletar agora, 3 falhas, pausa automática, retomar", async ({
  page,
  baseURL,
}) => {
  test.setTimeout(120_000);
  await enter(page, "helena", baseURL);
  await page.goto(`${BASE}/nova`);
  await page.getByLabel("Endereço da fonte").fill("https://jornaldachapada.example/secao");
  await page.getByRole("button", { name: "Analisar" }).click();
  const status = page.getByRole("status");
  await expect(status).not.toHaveAttribute("aria-busy", "true", { timeout: 30_000 });
  if (await page.getByRole("alert").filter({ hasText: "muitas análises" }).isVisible())
    test.skip(true, "cota de análises da hora esgotada (rode pnpm db:reset)");
  if (await status.getByText(/já está cadastrada/).isVisible())
    test.skip(true, "Jornal da Chapada já cadastrado nesta base (rode pnpm db:reset)");

  // Sem feed: a IA sugere seletores, validados com ≥ 3 itens do mesmo site (critério 5).
  await expect(status).toContainText("nenhum feed; usando lista de notícias da página");
  await expect(page.getByText("Seletores da IA validados")).toBeVisible();
  const preview = page.getByRole("list", { name: "Prévia dos últimos itens" });
  await expect(preview.getByRole("listitem")).toHaveCount(5);
  await expect(preview.locator("img")).toHaveCount(0);
  await expect(page.getByLabel("Nome", { exact: true })).toHaveValue("Jornal da Chapada");
  await expect(page.getByLabel("Política de imagem")).toHaveValue("none");
  await expect(page.getByLabel("Política de republicação")).toHaveValue("link_only");
  const slug = await page.getByLabel("Slug").inputValue();
  expect(slug).toBe("jornal-da-chapada");

  // Ativar exige termos revisados (critério 10): sem a caixa, "Salvar e ativar" não ativa.
  await page.getByLabel("Li os termos de uso e a coleta é permitida").check();
  await page.getByRole("button", { name: "Salvar e ativar" }).click();
  await expect(page).toHaveURL(/\/estudio\/control\/fontes\/[0-9a-f-]+\?cadastro=ativa$/);
  const id = /fontes\/([0-9a-f-]+)\?/.exec(page.url())![1]!;
  await expect(page.getByRole("heading", { level: 1, name: "Jornal da Chapada" })).toBeVisible();
  await expect(page.getByText("Ativa", { exact: true }).first()).toBeVisible();

  // "Coletar agora" (§7.4): run manual só com o fetch desta fonte; 2ª vez em 5 min é recusada.
  await page.getByRole("button", { name: "Coletar agora" }).first().click();
  await expect(page.getByRole("status").filter({ hasText: "Coleta enfileirada" })).toBeVisible();
  await page.getByRole("button", { name: "Coletar agora" }).first().click();
  await expect(
    page.getByRole("alert").filter({ hasText: "uma vez a cada 5 minutos" }),
  ).toBeVisible();

  // 3 runs seguidos com a fonte respondendo 500 (D-F18, Review Focus 3): degraded, degraded, pausada.
  const first = await failFetchTimes(slug, 1);
  expect(first.outcomes).toEqual(["failed"]);
  expect(first.state).toMatchObject({ status: "degraded", consecutiveFailures: 1 });
  await page.reload();
  await expect(page.getByText(/^Com falhas · 1 falha seguida/)).toBeVisible();
  const rest = await failFetchTimes(slug, 2);
  expect(rest.outcomes).toEqual(["failed", "failed"]);
  expect(rest.state).toMatchObject({
    status: "paused",
    statusReason: "auto_failures",
    consecutiveFailures: 3,
  });
  const notes = await notificationsFor(id, "source_auto_paused");
  expect(notes.length).toBeGreaterThanOrEqual(1);
  expect(notes[0]!.channel).toBe("control_center");
  expect(notes[0]!.title).toContain("Fonte Jornal da Chapada pausada após 3 falhas seguidas");

  await page.goto(`${BASE}?status=auto_paused`);
  const row = page.locator("tbody tr").filter({ hasText: "Jornal da Chapada" });
  await expect(row).toBeVisible();
  await expect(row.getByText("Pausada automaticamente")).toBeVisible();

  // Retomar roda o teste de conexão (fixture ok) e volta a ativa (§7.3).
  await page.goto(`${BASE}/${id}`);
  await expect(page.getByText(/^Pausada automaticamente em .* após 3 falhas$/)).toBeVisible();
  await page.getByRole("button", { name: "Retomar" }).click();
  await expect(page.getByRole("status")).toContainText("Fonte retomada");
  await expect(page.getByText("Ativa", { exact: true }).first()).toBeVisible();
  expect(await sourceState(slug)).toMatchObject({ status: "active", consecutiveFailures: 0 });

  // Histórico: pausa automática pelo sistema e retomada por Helena.
  await page.goto(`${BASE}/${id}/historico`);
  await expect(page.getByRole("cell", { name: "Sistema" }).first()).toBeVisible();
  await expect(page.getByRole("cell", { name: "Helena Costa" }).first()).toBeVisible();
  await axeClean(page);
});

test("opt-out: bloquear por pedido do veículo tira agregados e imagens do portal", async ({
  page,
  baseURL,
}) => {
  await page.goto("/");
  const panorama = page.getByRole("region", { name: PANORAMA });
  await expect(panorama.getByText("Diário da Baixada").first()).toBeVisible();

  await enter(page, "helena", baseURL);
  await page.goto(`${BASE}/${SEED.diario}`);
  await page.getByRole("button", { name: "Bloquear", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("radio", { name: "Pedido do veículo" }).check();
  await expect(dialog.getByText("remove todas as reproduções da fonte")).toBeVisible();
  await dialog.getByLabel("Detalhes (opcional)").fill("E-mail do editor em 28/09");
  await dialog.getByRole("button", { name: "Bloquear", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Fonte bloqueada a pedido do veículo");
  await expect(page.getByText(/^Bloqueada · /)).toBeVisible();

  await page.goto(`${BASE}/${SEED.diario}/configuracao`);
  await expect(page.getByLabel("Política de imagem")).toHaveValue("none");

  await page.goto("/");
  await expect(page.getByRole("region", { name: PANORAMA })).toBeVisible();
  await expect(
    page.getByRole("region", { name: PANORAMA }).getByText("Diário da Baixada"),
  ).toHaveCount(0);
});

test("score 1 tira a fonte do Veja também da home", async ({ page, baseURL }) => {
  await page.goto("/");
  await expect(
    page.getByRole("region", { name: PANORAMA }).getByText("Agência Cerrado").first(),
  ).toBeVisible();

  await enter(page, "marina", baseURL);
  await page.goto(`${BASE}/${SEED.agencia}/configuracao`);
  await page.getByRole("radio", { name: "1 de 5" }).check({ force: true });
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(page.getByRole("status")).toContainText("Alterações salvas");
  await page.goto(`${BASE}/${SEED.agencia}`);
  await expect(page.getByText("1 de 5").first()).toBeVisible();

  await page.goto("/");
  await expect(page.getByRole("region", { name: PANORAMA })).toBeVisible();
  await expect(
    page.getByRole("region", { name: PANORAMA }).getByText("Agência Cerrado"),
  ).toHaveCount(0);
});

test("via rápida: Folha do Cerrado em 10 min; fast-tick cria um run fast, o drain coleta e os itens seguem o pipeline", async ({
  page,
  baseURL,
}) => {
  test.setTimeout(240_000);
  const secret = cronSecret();
  await enter(page, "helena", baseURL);
  await ensureActive(page, SEED.folha);

  await page.goto(`${BASE}/${SEED.folha}/configuracao`);
  await page.getByLabel("Frequência de coleta").selectOption("10");
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(page.getByRole("status")).toContainText(/Alterações salvas|Nenhuma alteração/);
  await page.goto(`${BASE}/${SEED.folha}/coleta`);
  await expect(page.getByText("Via rápida", { exact: true }).first()).toBeVisible();

  // Sem o segredo, 401 (critério 23); com fonte rápida ativa, o status mostra o bloco `fast`.
  expect((await fastTick(baseURL!)).status).toBe(401);
  const st = await ingestStatus(baseURL!, secret);
  expect(st.status).toBe(200);
  expect((st.body.fast as { sources: number }).sources).toBeGreaterThanOrEqual(1);

  // Fonte vencida: um único run `fast` na janela de 10 min, só o fetch enfileirado; a 2ª chamada
  // na mesma janela reencontra o run e não enfileira de novo.
  await resetFetchState("folha-do-cerrado");
  const before = await collectedCount(SEED.folha);
  const t1 = await fastTick(baseURL!, secret);
  expect(t1.status).toBe(200);
  const r1 = t1.body as { status: string; runId: string; enqueued: number };
  expect(["started", "existing"]).toContain(r1.status);
  expect(r1.enqueued).toBeGreaterThanOrEqual(1);
  const t2 = await fastTick(baseURL!, secret);
  const r2 = t2.body as { status: string; runId: string; enqueued: number };
  expect(r2).toMatchObject({ status: "existing", runId: r1.runId, enqueued: 0 });

  // O drain normal processa fetch → validate → … com IA falsa; repete até esvaziar a fila.
  for (let i = 0; i < 8; i++) {
    const d = await drain(baseURL!, secret);
    expect(d.status).toBe(200);
    if ((d.body as { remaining: number }).remaining === 0) break;
  }
  await expect.poll(() => collectedCount(SEED.folha), { timeout: 60_000 }).toBeGreaterThan(before);

  await page.goto(`${BASE}/${SEED.folha}/coleta`);
  const runs = page.getByRole("table").filter({ hasText: "Tipo" });
  await expect(runs.getByRole("row").filter({ hasText: "Via rápida" }).first()).toBeVisible();
  await expect(runs.getByRole("row").filter({ hasText: "Via rápida" }).first()).toContainText("Ok");
  await page.goto(`${BASE}/${SEED.folha}/itens`);
  await expect(page.getByText("Cesta básica recua 2,1% em setembro na capital")).toBeVisible();
  await axeClean(page);
});

/**
 * Lista O03 com efeito colateral (antes em control-sources-list.spec.ts, achado M-7 da revisão
 * final): pausar em lote e pelo menu, mudar frequência em lote e as vagas da via rápida mexem em
 * fontes do seed que os specs públicos do P4 contam (`login-invite` conta as 11 fontes visíveis).
 * Aqui rodam depois dos projetos desktop/mobile, em série, e o `afterAll` devolve o seed.
 */
const URL = BASE;
const LIST_SEED = {
  folha: SEED.folha,
  diario: SEED.diario,
  mtAgora: "c5000000-0000-4000-8000-000000000003",
  cena: "c5000000-0000-4000-8000-000000000008",
};

test.afterAll(async () => {
  const svc = serviceClient();
  await svc
    .from("sources")
    .update({ status: "active", status_reason: null, consecutive_failures: 0 })
    .in("id", [LIST_SEED.folha, LIST_SEED.mtAgora])
    .eq("status", "paused");
  await svc
    .from("sources")
    .update({ frequency_minutes: null })
    .in("id", [LIST_SEED.diario, LIST_SEED.cena]);
  await svc.rpc("app_setting_set", { p_key: "sources.fast_lane_max", p_value: 10 });
});

test("Diego filtra, ordena e pausa em lote", async ({ page }) => {
  await loginAs(page.context(), "diego");
  await page.goto(`${URL}?status=ativa&ordem=score`);
  await expect(page.getByRole("heading", { level: 1, name: "Fontes" })).toBeVisible();

  await page.getByRole("checkbox", { name: "Selecionar Folha do Cerrado" }).check();
  await page.getByRole("checkbox", { name: "Selecionar MT Agora" }).check();
  await expect(page.getByText("2 fontes selecionadas")).toBeVisible();

  await page.getByRole("button", { name: "Pausar", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Pausar 2 fontes" }).click();
  await expect(page.getByRole("status")).toContainText("2 pausadas");
  await expect(page).toHaveURL(/status=ativa/);
});

test("configurações da coleta: padrão sem opções rápidas; vagas da via rápida com uso", async ({
  page,
}) => {
  await loginAs(page.context(), "helena");
  await page.goto(URL);
  await page.getByRole("button", { name: "Configurações da coleta" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText(/Via rápida: \d+ de 10/)).toBeVisible();
  const select = dialog.getByLabel("Frequência padrão");
  await expect(select.locator("option", { hasText: "10 min" })).toHaveCount(0);
  await expect(select.locator("option", { hasText: "15 min" })).toHaveCount(0);
  await expect(select.locator("option", { hasText: "20 min" })).toHaveCount(0);

  await dialog.getByLabel("Vagas da via rápida").fill("5");
  await dialog.getByRole("button", { name: "Salvar" }).nth(1).click();
  await expect(dialog.getByText("Vagas da via rápida salvas")).toBeVisible();
  await expect(dialog.getByText(/Via rápida: \d+ de 5/)).toBeVisible();
});

test("pausar pelo menu mostra Desfazer; desfazer retoma de novo", async ({ page }) => {
  await loginAs(page.context(), "diego");
  await page.goto(`${URL}?status=ativa`);
  await page.getByRole("button", { name: "Ações de Placar MT" }).click();
  await page.getByRole("menuitem", { name: "Pausar" }).click();
  const toast = page.getByRole("status");
  await expect(toast).toContainText("Fonte pausada");
  await toast.getByRole("button", { name: "Desfazer" }).click();
  // Desfazer usa o lote de uma fonte só (sem repetir o teste de conexão do "Retomar" direto).
  await expect(toast).toContainText("1 ativada");
});

test("frequência em lote: rádios por via, resultado previsto e motivo obrigatório", async ({
  page,
}) => {
  await loginAs(page.context(), "diego");
  await page.goto(`${URL}?status=ativa`);
  await page.getByRole("checkbox", { name: "Selecionar Diário da Baixada" }).check();
  await page.getByRole("checkbox", { name: "Selecionar Cena Cuiabana" }).check();
  await page.getByRole("button", { name: "Mudar frequência" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("radio", { name: /Seguir o padrão global/ })).toBeChecked();
  await expect(dialog.getByText(/Resultado previsto: 2/)).toBeVisible();

  await dialog.getByRole("button", { name: "Aplicar às 2 fontes" }).click();
  await expect(dialog.getByText("Explique o motivo desta mudança em lote.")).toBeVisible();

  await dialog.getByRole("radio", { name: /Ciclo normal/ }).check();
  await dialog.getByLabel("Intervalo do ciclo normal").selectOption({ label: "1 h" });
  await expect(dialog.getByText("Resultado previsto: 2 fontes passam a 1 h.")).toBeVisible();
  await dialog.getByLabel("Motivo (vai para a auditoria)").fill("Reduzir carga no fim de semana");
  await dialog.getByRole("button", { name: "Aplicar às 2 fontes" }).click();

  await expect(page.getByRole("status")).toContainText("com a frequência nova");
});
