// @vitest-environment node
import { afterAll, describe, expect, it } from "vitest";
import { createCallAgent } from "@/lib/ai/call-agent";
import { createFakeProvider } from "@/lib/ai/fake";
import { createMemoryAiStore } from "@/lib/ai/testing/memory-store";
import { collectAgenda, type CollectDeps } from "@/lib/agenda/collect";
import { FIXTURE_AGENDA_SOURCES } from "@/lib/agenda/sources";
import { createPublicClient, createServiceClient } from "@/lib/db/client";
import { createAgendaStore } from "@/lib/db/agenda-store";
import { createExternalMediaRepo } from "@/lib/db/external-media-store";
import { registerExternalImage } from "@/lib/media/external";
import { createMemoryMediaStore } from "@/lib/media/store";
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

const IMAGE_URLS = [
  "https://cerradovivo.example/img/siriri-moderno.jpg",
  "https://eventos-cerrado.example/wp-content/uploads/2026/10/sarau.jpg",
  "https://teatro-cerrado.example/img/forro-da-praca.jpg",
];

afterAll(async () => {
  await db.from("event_listings").delete().like("source_id", "%").not("source_id", "is", null);
  await db.from("media_assets").delete().in("origin_url", IMAGE_URLS);
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

describe("imagem, organizador e faixa etária no banco (ARD-T2)", () => {
  const crawl = crawlDeps({
    repo: { hitRateLimit: async () => true },
    env: { CRAWLER_FIXTURES: "1", NODE_ENV: "test" },
  });
  const images = {
    crawl,
    repo: createExternalMediaRepo(db),
    store: createMemoryMediaStore(),
    reproductionEnabled: async () => true,
    now: () => NOW,
  };
  const runWithImages = () =>
    collectAgenda({
      crawl,
      sources: FIXTURE_AGENDA_SOURCES,
      now: () => NOW,
      existing: () => store.existing(NOW),
      save: (e, at) => store.save(e, at),
      stored: (keys) => store.stored(keys),
      registerImage: (input) => registerExternalImage(images, input),
      ...ai(),
    });
  const row = async (title: string) => {
    const { data, error } = await db
      .from("event_listings")
      .select("id, organizer, age_rating, media_id, locked_fields")
      .eq("title", title)
      .not("source_id", "is", null)
      .single();
    if (error) throw new Error(error.message);
    return data;
  };

  it("grava organizador, faixa e a imagem no Media Registry (reprodução, direitos unknown)", async () => {
    await runWithImages();
    const siriri = await row("Noite do Siriri Moderno");
    expect(siriri).toMatchObject({ organizer: "Coletivo Siriri Cuiabano", age_rating: "16" });
    expect(siriri.media_id).not.toBeNull();
    const { data: asset } = await db
      .from("media_assets")
      .select("kind, origin_url, credit, rights_status, disclaimer, usage_scope, status")
      .eq("id", siriri.media_id!)
      .single();
    expect(asset).toMatchObject({
      kind: "reproduction",
      origin_url: "https://cerradovivo.example/img/siriri-moderno.jpg",
      credit: "Foto: reprodução web · Casa Cerrado Vivo (fictícia)",
      rights_status: "unknown",
      disclaimer: "Foto: reprodução web",
      usage_scope: ["editorial"],
      status: "approved",
    });
    const forro = await row("Forró da Praça");
    expect(forro).toMatchObject({ organizer: "Coletivo Forró Cerrado", age_rating: "14" });
    expect(forro.media_id).not.toBeNull();
  });

  it("nova coleta não duplica o ativo nem troca a imagem do evento", async () => {
    const before = await row("Noite do Siriri Moderno");
    await runWithImages();
    const after = await row("Noite do Siriri Moderno");
    expect(after.media_id).toBe(before.media_id);
    const { count } = await db
      .from("media_assets")
      .select("id", { count: "exact", head: true })
      .in("origin_url", IMAGE_URLS);
    expect(count).toBe(3);
  });

  it("organizer, age_rating e media_id travados no Estúdio não são sobrescritos pela coleta", async () => {
    const forro = await row("Forró da Praça");
    await db
      .from("event_listings")
      .update({
        organizer: "Produção da Redação",
        age_rating: "livre",
        media_id: null,
        locked_fields: ["organizer", "age_rating", "media_id"],
      })
      .eq("id", forro.id);
    await runWithImages();
    expect(await row("Forró da Praça")).toMatchObject({
      organizer: "Produção da Redação",
      age_rating: "livre",
      media_id: null,
    });
  });
});
