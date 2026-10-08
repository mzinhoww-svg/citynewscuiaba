// @vitest-environment node
import { afterAll, describe, expect, it } from "vitest";
import { createCallAgent } from "@/lib/ai/call-agent";
import { createFakeProvider } from "@/lib/ai/fake";
import { createMemoryAiStore } from "@/lib/ai/testing/memory-store";
import { collectAgenda, type CollectDeps } from "@/lib/agenda/collect";
import { FIXTURE_AGENDA_SOURCES } from "@/lib/agenda/sources";
import { createPublicClient, createServiceClient } from "@/lib/db/client";
import { createAgendaStore } from "@/lib/db/agenda-store";
import { crawlDeps } from "@/lib/sources/http-deps";

const db = createServiceClient();
const store = createAgendaStore(db);
const NOW = new Date("2026-10-03T15:00:00Z");

/** Coleta sem cache nem estado de fonte no banco (as fontes fictícias não estão em `sources`). */
const ai = () => ({
  callAgent: createCallAgent({
    store: createMemoryAiStore(),
    provider: createFakeProvider(),
    now: () => NOW,
  }),
  cache: { get: async () => null, put: async () => {} },
  aiBudget: { perRun: 40, remainingToday: 160 },
  monotonic: () => 0,
  sourceState: async () => {},
});

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
    stored: (keys) => store.stored(keys),
    ...ai(),
  });

afterAll(async () => {
  await db.from("event_listings").delete().like("source_id", "%").not("source_id", "is", null);
});

describe("coleta da Agenda no banco", () => {
  it("grava os aprovados, visíveis ao público, com link do original e preço desconhecido", async () => {
    const r = await run();
    expect(r.saved).toBe(10);
    const anon = createPublicClient();
    const { data } = await anon
      .from("event_listings")
      .select("title, source_url, price_unknown, is_free, age_rating, origin")
      .not("source_id", "is", null);
    expect(data).toHaveLength(10);
    // Sympla e a casa (que confirma) listam o mesmo show: fica a linha da casa.
    const f = data?.find((e) => e.title === "Festival Cerrado Eletrônico");
    expect(f).toMatchObject({
      price_unknown: true,
      is_free: false,
      age_rating: "consulte",
      source_url: "https://teatro-cerrado.example/evento/festival-cerrado-eletronico",
    });
    expect(data?.find((e) => e.title.startsWith("Cine Praça"))?.origin).toBe("official");
  });

  it("rodar de novo não duplica (chave de duplicidade)", async () => {
    await run();
    const { count } = await db
      .from("event_listings")
      .select("id", { count: "exact", head: true })
      .not("source_id", "is", null);
    expect(count).toBe(10);
  });

  it("registra a execução", async () => {
    const id = await store.startRun("manual", NOW);
    await store.finishRun(id, await collectAgenda({ ...(await baseDeps()), dryRun: true }));
    const last = await store.lastRunStartedAt();
    expect(last).not.toBeNull();
    await db.from("agenda_collect_runs").delete().eq("id", id);
  });
});

async function baseDeps(): Promise<CollectDeps> {
  return {
    ...ai(),
    stored: async () => [],
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
