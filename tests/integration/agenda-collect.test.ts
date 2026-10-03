// @vitest-environment node
import { afterAll, describe, expect, it } from "vitest";
import { collectAgenda } from "@/lib/agenda/collect";
import { FIXTURE_AGENDA_SOURCES } from "@/lib/agenda/sources";
import { createPublicClient, createServiceClient } from "@/lib/db/client";
import { createAgendaStore } from "@/lib/db/agenda-store";
import { crawlDeps } from "@/lib/sources/http-deps";

const db = createServiceClient();
const store = createAgendaStore(db);
const NOW = new Date("2026-10-03T15:00:00Z");

const run = () =>
  collectAgenda({
    crawl: crawlDeps({
      repo: { hitRateLimit: async () => true },
      env: { CRAWLER_FIXTURES: "1", NODE_ENV: "test" },
    }),
    sources: FIXTURE_AGENDA_SOURCES,
    now: () => NOW,
    existing: () => store.existing(NOW),
    save: (e, at) => store.save(e, at),
  });

afterAll(async () => {
  await db.from("event_listings").delete().like("source_id", "%").not("source_id", "is", null);
});

describe("coleta da Agenda no banco", () => {
  it("grava os aprovados, visíveis ao público, com link do original e preço desconhecido", async () => {
    const r = await run();
    expect(r.saved).toBe(7);
    const anon = createPublicClient();
    const { data } = await anon
      .from("event_listings")
      .select("title, source_url, price_unknown, is_free, age_rating, origin")
      .not("source_id", "is", null);
    expect(data).toHaveLength(7);
    const f = data?.find((e) => e.title === "Festival Cerrado Eletrônico");
    expect(f).toMatchObject({
      price_unknown: true,
      is_free: false,
      age_rating: "consulte",
      source_url: "https://ingressosmt.example/evento/cerrado-eletronico/1001",
    });
    expect(data?.find((e) => e.title.startsWith("Cine Praça"))?.origin).toBe("official");
  });

  it("rodar de novo não duplica (chave de duplicidade)", async () => {
    await run();
    const { count } = await db
      .from("event_listings")
      .select("id", { count: "exact", head: true })
      .not("source_id", "is", null);
    expect(count).toBe(7);
  });

  it("registra a execução", async () => {
    const id = await store.startRun("manual", NOW);
    await store.finishRun(id, await collectAgenda({ ...(await baseDeps()), dryRun: true }));
    const last = await store.lastRunStartedAt();
    expect(last).not.toBeNull();
    await db.from("agenda_collect_runs").delete().eq("id", id);
  });
});

async function baseDeps() {
  return {
    crawl: crawlDeps({
      repo: { hitRateLimit: async () => true },
      env: { CRAWLER_FIXTURES: "1", NODE_ENV: "test" },
    }),
    sources: FIXTURE_AGENDA_SOURCES,
    now: () => NOW,
    existing: async () => [],
    save: async () => 0,
  };
}
