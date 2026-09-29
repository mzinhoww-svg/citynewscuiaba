import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { assignVariant } from "@/lib/ranking";
import { loginAs, service, STAFF, tag } from "./studio";

/*
 * Recomendação (P5-T7): painel com diversidade e concentração, pesos com soma exibida e aprovação
 * dupla, teste A/B (criar, iniciar, medir, encerrar) e "Por que esta recomendação" com id anônimo
 * pseudonimizado. Fluxos que mudam pesos e testes rodam em série e só no desktop (uma versão de
 * pesos em vigor por vez).
 */
test.describe.configure({ mode: "serial" });

const versions: string[] = [];
const experiments: string[] = [];
const anons: string[] = [];
const statKeys: { day: string; source_id: string }[] = [];
let originalActive = "rec-v1";

test.afterAll(async () => {
  const db = service();
  if (versions.length) {
    await db.from("approvals").delete().eq("kind", "rec.weights").in("target_ref", versions);
    await db.from("rec_weights").update({ active: false }).in("version", versions);
    await db.from("rec_weights").update({ active: true }).eq("version", originalActive);
    await db.from("rec_weights").delete().in("version", versions);
  }
  if (experiments.length) await db.from("rec_experiments").delete().in("id", experiments);
  if (anons.length) await db.from("events").delete().in("anon_id", anons);
  for (const k of statKeys)
    await db.from("source_stats_daily").delete().eq("day", k.day).eq("source_id", k.source_id);
});

test.beforeAll(async () => {
  const r = await service().from("rec_weights").select("version").eq("active", true).single();
  originalActive = r.data?.version ?? "rec-v1";
});

test("o painel mostra diversidade e concentração e avisa quando as 3 maiores passam de 50%", async ({
  page,
}) => {
  const db = service();
  const src = await db.from("sources").select("id").is("archived_at", null).limit(3);
  const day = new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10);
  for (const s of src.data ?? []) {
    const ins = await db
      .from("source_stats_daily")
      .upsert({ day, source_id: s.id, clicks: 900_000, sessions: 900_000 });
    expect(ins.error).toBeNull();
    statKeys.push({ day, source_id: s.id });
  }
  await loginAs(page, "diego", "/estudio/control/recomendacao");
  await expect(
    page.getByRole("heading", { level: 1, name: "Recomendação de fontes" }),
  ).toBeVisible();
  await expect(page.getByText("Índice de diversidade", { exact: true })).toBeVisible();
  await expect(page.getByText("Concentração alta")).toBeVisible();
  const bars = page.getByRole("img", { name: /Participação de cada fonte/ });
  await expect(bars).toBeVisible();
  await expect(page.getByText(/fontes com cliques\. Maior participação:/)).toBeVisible();
  const table = page.getByRole("table", { name: /Participação de cada fonte/ });
  await expect(table.getByRole("columnheader", { name: "Participação" })).toBeVisible();
  await expect(page.getByText("Score editorial (rec-v2)")).toBeVisible();
});

test("pesos: soma exibida, salvar desligado fora de 1,00, proposta passa pela aprovação dupla", async ({
  page,
}, info) => {
  test.skip(
    info.project.name !== "desktop",
    "Uma versão de pesos em vigor por vez: só no desktop.",
  );
  const why = `Mais diversidade ${tag()}`;
  await loginAs(page, "diego", "/estudio/control/recomendacao");
  const propose = page.getByRole("button", { name: "Propor novos pesos" });
  await expect(propose).toBeDisabled();
  await expect(page.getByRole("status").filter({ hasText: "Soma 1,00: válida." })).toBeVisible();

  const div = page.getByRole("slider", { name: "Diversidade", exact: true });
  await div.focus();
  for (let i = 0; i < 5; i++) await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("status").filter({ hasText: "Soma 1,05: precisa ser 1,00 para salvar." }),
  ).toBeVisible();
  await page.getByLabel("Justificativa").fill(why);
  await expect(propose).toBeDisabled();

  await page.getByRole("button", { name: "Ajustar proporcionalmente para 1,00" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Soma 1,00: válida." })).toBeVisible();
  await expect(propose).toBeEnabled();
  await propose.click();
  const done = page.getByRole("status").filter({ hasText: /Versão rec-v1\.\d+ proposta/ });
  await expect(done).toBeVisible();
  const version = /rec-v1\.\d+/.exec((await done.textContent()) ?? "")![0];
  versions.push(version);

  const row = await service()
    .from("rec_weights")
    .select("active, approved_by")
    .eq("version", version)
    .single();
  expect(row.data).toEqual({ active: false, approved_by: null });

  // Quem propôs não aprova; a marina (editor-chefe) não decide pesos; a helena (admin) decide.
  await page.goto("/estudio/control/aprovacoes");
  await expect(
    page
      .getByRole("article")
      .filter({ hasText: why })
      .getByRole("button", { name: /^Aprovar:/ }),
  ).toHaveCount(0);
  await page.context().clearCookies();
  await loginAs(page, "helena", "/estudio/control/aprovacoes");
  await page
    .getByRole("article")
    .filter({ hasText: why })
    .getByRole("button", { name: /^Aprovar:/ })
    .click();
  await expect(page.getByRole("status").filter({ hasText: "Aprovação registrada." })).toBeVisible();
  await page.goto("/estudio/control/recomendacao");
  await expect(page.getByText(`Versão de pesos: ${version}`).first()).toBeVisible();
  await expect(
    page
      .getByRole("table", { name: /Versões de pesos/ })
      .getByRole("row", { name: new RegExp(`${version}.*Em vigor`) }),
  ).toBeVisible();
});

test("teste A/B: criar, iniciar, ver métricas por variante e encerrar", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "Fluxo único: só no desktop.");
  const db = service();
  const extra = `rec-v1.${800 + (Date.now() % 90)}`;
  await db.from("rec_weights").insert({
    version: extra,
    weights: {
      popularity: 0.3,
      individual: 0.2,
      recency: 0.15,
      engagement: 0.1,
      operational: 0.1,
      diversity: 0.15,
    },
    cap: 0.25,
    discovery_every: 5,
    proposed_by: STAFF.diego.id,
    // Gate P5: experimento só serve pesos já aprovados por outra pessoa.
    approved_by: STAFF.helena.id,
  });
  versions.push(extra);

  const name = `Diversidade ${tag()}`;
  await loginAs(page, "diego", "/estudio/control/recomendacao");
  await page.getByLabel("Nome do teste").fill(name);
  await page.getByLabel("Variante 1: versão de pesos").selectOption("rec-v1");
  await page.getByLabel("Variante 2: versão de pesos").selectOption(extra);
  await page.getByLabel("Divisão da variante 1 (%)").fill("70");
  await expect(page.getByText("Divisão soma 100%: precisa ser 100%.")).toHaveCount(0);
  await page.getByLabel("Divisão da variante 2 (%)").fill("20");
  await expect(page.getByText("Divisão soma 90%: precisa ser 100%.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Criar teste" })).toBeDisabled();
  await page.getByLabel("Divisão da variante 2 (%)").fill("30");
  await page.getByRole("button", { name: "Criar teste" }).click();
  await expect(page).toHaveURL(/\/recomendacao\/testes\/[a-z0-9-]+$/);
  const id = /testes\/([a-z0-9-]+)$/.exec(page.url())![1]!;
  experiments.push(id);
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
  await expect(page.getByText("Ainda não iniciado")).toBeVisible();

  await page.getByRole("button", { name: "Iniciar teste" }).click();
  await expect(page.getByText(/Em andamento desde/)).toBeVisible();
  await expect(page.getByText(/Sem eventos de leitores na janela do teste/)).toBeVisible();

  // Leitores com Personalização, sorteados pelo mesmo hash do portal.
  const split = [0.7, 0.3];
  const events = [];
  for (let i = 0; i < 30; i++) {
    const anon = randomUUID();
    anons.push(anon);
    const v = assignVariant(anon, { id, split });
    const base = {
      anon_id: anon,
      at: new Date().toISOString(),
      source_slug: "folha-do-cerrado",
      session: { id: "s", page: "/fontes", referrer: null, device: "desktop" },
      consent: { version: "1", metrics: true, personalization: true },
      algo_version: "rec-v1",
    };
    events.push({ ...base, name: "source_viewed", props: { surface: "fontes" } });
    if (v === 1)
      events.push({
        ...base,
        name: "recommendation_clicked",
        props: { list: "recommended", reason: "trending", position: 1 },
      });
  }
  expect((await db.from("events").insert(events)).error).toBeNull();
  await page.reload();
  const table = page.getByRole("table", { name: "Métricas por variante do teste" });
  await expect(table.getByRole("columnheader", { name: "CTR", exact: true })).toBeVisible();
  await expect(table.getByRole("row", { name: /Variante 2/ })).toContainText("100%");
  await expect(page.getByRole("img", { name: "CTR por variante" })).toBeVisible();
  await expect(page.getByText(/CTR por variante: Variante 1 \(controle\)/)).toBeVisible();

  await page.getByLabel("Variante vencedora").selectOption("1");
  await page.getByRole("button", { name: "Encerrar teste" }).click();
  await expect(page.getByText(/Encerrado em/)).toBeVisible();
  const done = await db.from("rec_experiments").select("status, winner").eq("id", id).single();
  expect(done.data).toEqual({ status: "ended", winner: 1 });
  await page.getByLabel("Justificativa").fill("Diversidade subiu");
  await page.getByRole("button", { name: "Promover a vencedora" }).click();
  // Gate P5: a promoção copia os pesos vencedores numa nova proposta e pede a aprovação dela.
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: /Pedido de aprovação enviado para os pesos rec-v1\.\d+/ }),
  ).toBeVisible();
  const promo = await db
    .from("approvals")
    .select("target_ref")
    .eq("kind", "rec.weights")
    .like("justification", `%${extra}%`);
  for (const a of promo.data ?? []) versions.push(a.target_ref);
  expect(promo.data).toHaveLength(1);

  await page.goto("/estudio/control/recomendacao/testes/nao-existe");
  await expect(page.getByRole("heading", { level: 1, name: "Teste não encontrado" })).toBeVisible();
});

test("Por que esta recomendação: apelido, componentes e peso individual 0 sem Personalização", async ({
  page,
}) => {
  const db = service();
  const on = randomUUID();
  const off = randomUUID();
  anons.push(on, off);
  const base = {
    at: new Date().toISOString(),
    name: "source_viewed",
    source_slug: "folha-do-cerrado",
    session: { id: "s", page: "/fontes", referrer: null, device: "desktop" },
    algo_version: "rec-v1",
    props: { surface: "fontes" },
  };
  await db.from("events").insert([
    { ...base, anon_id: on, consent: { version: "1", metrics: true, personalization: true } },
    { ...base, anon_id: off, consent: { version: "1", metrics: true, personalization: false } },
  ]);
  await loginAs(page, "helena", "/estudio/control/recomendacao");
  await page.getByText("Por que esta recomendação", { exact: true }).click();
  await page.getByLabel("Id anônimo do leitor").fill(off);
  await page.getByRole("button", { name: "Explicar recomendações" }).click();
  await expect(page.getByText(/O painel não mostra a afinidade individual/)).toBeVisible();
  const t = page.getByRole("table", {
    name: /Componentes do score das fontes recomendadas para leitor-/,
  });
  await expect(t.getByRole("columnheader", { name: "Afinidade individual" })).toBeVisible();
  const first = t.getByRole("row").nth(1);
  await expect(first).toContainText("0,00 × 0,00");
  expect(await page.content()).not.toContain(off);
  expect(page.url()).not.toContain(off);

  await page.getByLabel("Id anônimo do leitor").fill(on);
  await page.getByRole("button", { name: "Explicar recomendações" }).click();
  await expect(page.getByText(/O painel não mostra a afinidade individual/)).toBeVisible();
  expect(await page.content()).not.toContain(on);

  await page.getByLabel("Id anônimo do leitor").fill("isto-nao-e-um-id");
  await page.getByRole("button", { name: "Explicar recomendações" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Informe um id anônimo válido" }),
  ).toBeVisible();
});

test("quem só lê vê o painel sem as ações; sem papel de métricas a tela não abre", async ({
  page,
}) => {
  await loginAs(page, "otavio", "/estudio/control/recomendacao");
  await expect(page.getByText("Seu papel permite ver os pesos, não propô-los.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Propor novos pesos" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Criar teste" })).toHaveCount(0);
  await page.context().clearCookies();
  await loginAs(page, "juliana");
  await page.goto("/estudio/control/recomendacao");
  await expect(page).toHaveURL(/motivo=sem-permissao/);
});
