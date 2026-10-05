import { expect, test, type Page } from "@playwright/test";
import { service } from "./studio";
import {
  acquireFeaturedLock,
  cleanFixtures,
  createPublished,
  createTopic,
  endAllPins,
  newFixtures,
  reloadUntil,
} from "./helpers/featured";
import { cronSecret } from "./helpers/pipeline";

/*
 * HOT-T3 · Pauta quente vira destaque (spec 2026-10-03-destaques-e-profundidade R8, R10, R11):
 *  - com 3 portais (fontes distintas) pondo o assunto no topo, a matéria publicada dele vira a
 *    manchete da home com a chamada em texto "Em alta em Cuiabá", estável em dois reloads;
 *  - sem sinal (o pino de 3 h venceu), a manchete volta ao automático, sem a chamada.
 * Dados fictícios preparados com o service role; a pauta quente roda pela rota `frontpage` (com o
 * CRON_SECRET), que aplica os pinos no fim. Só no projeto desktop, com o cadeado dos destaques.
 */

const h1Text = async (page: Page) =>
  (await page.getByRole("heading", { level: 1 }).innerText()).trim();

test.describe("pauta quente na home", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(300_000);

  const fx = newFixtures();
  const signals: string[] = [];
  let release: (() => void) | null = null;
  const mark = Date.now().toString(36);
  const t = (s: string) => `${s} ${mark}`;
  let hot = { id: "", slug: "", title: "" };
  let auto = { id: "", slug: "", title: "" };
  let topic = "";

  const runFrontpage = async (baseURL: string) => {
    const res = await fetch(`${baseURL}/api/ingest/frontpage`, {
      method: "POST",
      headers: { authorization: `Bearer ${cronSecret()}`, "content-type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(200);
    return (await res.json()) as { hot: { pinned: number; renewed: number } | null };
  };

  test.beforeAll(async ({}, info) => {
    if (info.project.name !== "desktop") return;
    // O `beforeAll` tem tempo próprio (30 s), fora do `test.setTimeout` do grupo; a espera pelo
    // cadeado dos destaques chega a 240 s quando outro grupo (pauta quente, admin) o segura.
    test.setTimeout(300_000);
    release = await acquireFeaturedLock();
    await endAllPins();
    const db = service();
    await db.from("feature_flags").update({ enabled: true }).eq("key", "hot_featured_enabled");
    topic = await createTopic(fx, t("Assunto em alta"));
    // A automática ganharia a manchete (mais nova e mais confiável); a quente é mais antiga.
    auto = await createPublished(fx, {
      title: t("Manchete automática"),
      hoursAgo: 1,
      confidence: 1,
    });
    hot = await createPublished(fx, {
      title: t("Matéria do assunto em alta"),
      hoursAgo: 20,
      confidence: 0.3,
      topicId: topic,
    });
    for (const id of [auto.id, hot.id]) {
      const u = await db.from("articles").update({ news_scope: "cuiaba" }).eq("id", id);
      if (u.error) throw u.error;
    }
  });

  test.afterAll(async () => {
    try {
      if (signals.length) await service().from("front_signals").delete().in("id", signals);
      await cleanFixtures(fx);
    } finally {
      release?.();
    }
  });

  test.beforeEach(({}, info) => {
    test.skip(info.project.name !== "desktop", "mexe nas posições globais: só no projeto desktop");
  });

  test("antes do sinal, a manchete é a automática e não há chamada de pauta quente", async ({
    page,
  }) => {
    await reloadUntil(page, "/", async () => (await h1Text(page)) === auto.title);
    await expect(page.getByText("Em alta em Cuiabá")).toHaveCount(0);
  });

  test("3 portais no topo: a matéria vira a manchete com 'Em alta em Cuiabá' em dois reloads", async ({
    page,
    baseURL,
  }) => {
    const db = service();
    const sources = await db.from("sources").select("id").limit(3);
    if (sources.error) throw sources.error;
    expect(sources.data).toHaveLength(3);
    const ins = await db
      .from("front_signals")
      .insert(
        sources.data.map((s, i) => ({
          source_id: s.id,
          topic_id: topic,
          url: `https://portal-${i}.example/${hot.slug}`,
          rank: i + 1,
        })),
      )
      .select("id");
    if (ins.error) throw ins.error;
    signals.push(...ins.data.map((r) => r.id));

    const report = await runFrontpage(baseURL!);
    expect(report.hot?.pinned).toBeGreaterThan(0);

    await reloadUntil(page, "/", async () => (await h1Text(page)) === hot.title);
    const lead = page.locator("main article").first();
    await expect(lead.getByText("Em alta em Cuiabá")).toBeVisible();
    // A chamada é texto, não plaqueta: nenhum rótulo de origem a mais na manchete.
    await expect(lead.getByTestId("card-kicker")).toHaveText("Em alta em Cuiabá");

    // Dois reloads seguidos: mesma manchete, mesma chamada.
    for (let i = 0; i < 2; i++) {
      await page.reload();
      expect(await h1Text(page)).toBe(hot.title);
      await expect(page.locator("main article").first().getByTestId("card-kicker")).toHaveText(
        "Em alta em Cuiabá",
      );
    }

    // Rodar de novo é inofensivo (idempotente): não cria pino novo.
    const again = await runFrontpage(baseURL!);
    expect(again.hot?.pinned ?? 0).toBe(0);
  });

  test("sem sinal (o pino venceu), a manchete volta ao automático", async ({ page, baseURL }) => {
    const db = service();
    await db.from("front_signals").delete().in("id", signals);
    // O pino quente dura 3 h: simula o fim dele (histerese) movendo a janela para trás.
    const past = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
    const u = await db
      .from("featured_items")
      .update({ starts_at: past(4), ends_at: past(1) })
      .eq("kind", "hot")
      .eq("article_id", hot.id)
      .is("ended_at", null);
    if (u.error) throw u.error;
    const report = await runFrontpage(baseURL!);
    expect(report.hot?.pinned ?? 0).toBe(0);

    await reloadUntil(page, "/", async () => (await h1Text(page)) === auto.title);
    await expect(page.getByText("Em alta em Cuiabá")).toHaveCount(0);
  });
});
