// @vitest-environment node
// AGM-T5: coletor multifonte no banco — fontes de `sources`, cache de extração com expurgo,
// execução com linha-resumo e linha por fonte, travas e retirada respeitadas, confirmação que
// atualiza a linha guardada e pausa automática após 3 falhas.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createCallAgent } from "@/lib/ai/call-agent";
import { createFakeProvider } from "@/lib/ai/fake";
import { createMemoryAiStore } from "@/lib/ai/testing/memory-store";
import { collectAgenda, type CollectDeps } from "@/lib/agenda/collect";
import { FIXTURE_AGENDA_SOURCES } from "@/lib/agenda/sources";
import type { AgendaSource } from "@/lib/agenda/types";
import { POST } from "@/app/api/ingest/agenda/route";
import { createServiceClient } from "@/lib/db/client";
import { loadEventSources } from "@/lib/db/agenda-sources";
import { createAgendaStore } from "@/lib/db/agenda-store";
import { crawlDeps } from "@/lib/sources/http-deps";
import { fixtureShiftDays, shiftFixtureDates } from "@/lib/sources/fixture-dates";

const db = createServiceClient();
const store = createAgendaStore(db);
const NOW = new Date("2026-10-03T15:00:00Z");
const UUIDS = FIXTURE_AGENDA_SOURCES.map((s) => s.uuid);
const SLUGS = FIXTURE_AGENDA_SOURCES.map((s) => s.id);
const BROKEN_SLUG = "agm-t5-quebrada";
const TEATRO = FIXTURE_AGENDA_SOURCES.find((s) => s.id === "teatro-cerrado")!;
const INGRESSOS = FIXTURE_AGENDA_SOURCES.find((s) => s.id === "ingressosmt")!;

function deps(over: Partial<CollectDeps> = {}): CollectDeps {
  const fake = createFakeProvider();
  return {
    crawl: crawlDeps({
      repo: { hitRateLimit: async () => true },
      env: { CRAWLER_FIXTURES: "1", NODE_ENV: "test" },
    }),
    sources: FIXTURE_AGENDA_SOURCES,
    now: () => NOW,
    existing: () => store.existing(NOW),
    save: (e, at) => store.save(e, at),
    callAgent: createCallAgent({ store: createMemoryAiStore(), provider: fake, now: () => NOW }),
    cache: { get: store.cacheGet, put: store.cachePut },
    aiBudget: { perRun: 40, remainingToday: 160 },
    monotonic: () => 0,
    stored: (keys) => store.stored(keys),
    sourceState: (uuid, outcome, detail) => store.sourceState(uuid, outcome, detail),
    ...over,
  };
}

async function cleanEvents() {
  await db.from("event_listings").delete().in("source_id", SLUGS);
}

beforeAll(async () => {
  const rows = FIXTURE_AGENDA_SOURCES.map((s, i) => ({
    id: s.uuid,
    slug: s.id,
    name: s.name,
    base_url: s.url,
    kind: "events" as const,
    locality: "cuiaba",
    status: "paused" as const,
    priority: Math.min(3, i + 1),
    confirms: s.confirms,
    extract_kind: s.kind,
    event_origin: s.origin,
    collector_notes: s.notes,
  }));
  const r = await db.from("sources").upsert(rows, { onConflict: "id" });
  if (r.error) throw r.error;
  await cleanEvents();
});

afterAll(async () => {
  vi.unstubAllEnvs();
  await cleanEvents();
  await db.from("agenda_extract_cache").delete().like("url", "%.example/%");
  const broken = await db.from("sources").select("id").eq("slug", BROKEN_SLUG).maybeSingle();
  if (broken.data) {
    await db.from("notifications").delete().eq("object_ref", `source:${broken.data.id}`);
    await db.from("sources").delete().eq("id", broken.data.id);
  }
  await db.from("agenda_collect_runs").delete().in("source_id", UUIDS);
  await db.from("sources").delete().in("id", UUIDS);
});

describe("loadEventSources", () => {
  it("lê só fontes de eventos, as que confirmam primeiro, com estado e avisos", async () => {
    const all = await loadEventSources(db);
    expect(all.every((s) => s.uuid && s.kind)).toBe(true);
    const firstNonConfirming = all.findIndex((s) => !s.confirms);
    expect(all.slice(firstNonConfirming).some((s) => s.confirms)).toBe(false);
    const teatro = all.find((s) => s.id === "teatro-cerrado")!;
    expect(teatro).toMatchObject({
      uuid: TEATRO.uuid,
      kind: "ai_page",
      confirms: true,
      enabled: false,
      notes: TEATRO.notes,
      listUrls: [],
    });
    // Seed (0196): as 3 da Sympla entram ativas.
    expect(all.filter((s) => s.kind === "sympla" && s.enabled).length).toBeGreaterThanOrEqual(1);
    expect(all.some((s) => s.id === "folha-do-cerrado")).toBe(false);
  });
});

describe("rota da coleta com fixtures", () => {
  it("expurga cache velho, grava cache, linha-resumo e uma linha por fonte", async () => {
    await db.from("agenda_extract_cache").upsert([
      {
        url: "https://velho.example/evento/x",
        content_hash: "h-velho",
        result: { ok: false, error: "sem_ano" },
        created_at: new Date(Date.now() - 31 * 86_400_000).toISOString(),
      },
      {
        url: "https://novo.example/evento/y",
        content_hash: "h-novo",
        result: { ok: false, error: "sem_ano" },
        created_at: new Date(Date.now() - 2 * 86_400_000).toISOString(),
      },
    ]);
    vi.stubEnv("CRON_SECRET", "segredo-agm-t5-coleta-da-agenda-32+");
    vi.stubEnv("CRAWLER_FIXTURES", "1");
    // Relógio real: datas das fixtures de eventos acompanham o calendário (AGM-T7).
    vi.stubEnv("CRAWLER_FIXTURES_DATES", "relative");
    vi.stubEnv("AI_PROVIDER", "fake");
    const before = await store.aiPagesToday(new Date());
    const res = await POST(
      new Request("http://x/api/ingest/agenda?force=1", {
        method: "POST",
        headers: { authorization: "Bearer segredo-agm-t5-coleta-da-agenda-32+" },
      }),
    );
    const body = (await res.json()) as { status: string; startedAt: string; aiPages: number };
    expect(body.status).toBe("done");
    // Listagem + 3 páginas (uma de cartaz sem ano): as quatro chamadas contam no teto.
    expect(body.aiPages).toBe(4);

    const cache = await db
      .from("agenda_extract_cache")
      .select("url")
      .in("url", [
        "https://velho.example/evento/x",
        "https://novo.example/evento/y",
        "https://teatro-cerrado.example/evento/forro-da-praca",
      ]);
    expect((cache.data ?? []).map((c) => c.url).sort()).toEqual([
      "https://novo.example/evento/y",
      "https://teatro-cerrado.example/evento/forro-da-praca",
    ]);

    const runs = await db
      .from("agenda_collect_runs")
      .select("source_id, ai_pages, stats, report, finished_at")
      .eq("started_at", body.startedAt);
    const summary = (runs.data ?? []).filter((r) => r.source_id === null);
    expect(summary).toHaveLength(1);
    expect(summary[0]?.finished_at).not.toBeNull();
    expect(summary[0]?.ai_pages).toBe(4);
    const perSource = (runs.data ?? []).filter((r) => r.source_id !== null);
    expect(perSource.map((r) => r.source_id).sort()).toEqual([...UUIDS].sort());
    const teatro = perSource.find((r) => r.source_id === TEATRO.uuid)!;
    expect(teatro.ai_pages).toBe(4);
    expect(teatro.stats).toMatchObject({
      found: 3,
      approved: 2,
      new: 2,
      rejected: { sem_ano: 1 },
      rejectedSamples: [
        { url: "https://teatro-cerrado.example/evento/sarau-de-verao", reason: "sem_ano" },
      ],
    });

    expect(await store.aiPagesToday(new Date())).toBe(before + 4);
    const last = await store.lastRunStartedAt();
    expect(last?.toISOString()).toBe(body.startedAt);

    const saved = await db
      .from("event_listings")
      .select("title, source_ref, confirmed_by_source_id, evidence, updated_at")
      .eq("source_id", "teatro-cerrado");
    const forro = saved.data?.find((e) => e.title === "Forró da Praça");
    expect(forro?.source_ref).toBe(TEATRO.uuid);
    // Evento da própria fonte que confirma: `confirmed_by_source_id` fica nulo.
    expect(forro?.confirmed_by_source_id).toBeNull();
    expect(forro?.evidence).toMatchObject({
      data: {
        trecho: shiftFixtureDates("sábado, 24 de outubro de 2026", fixtureShiftDays(new Date())),
      },
    });
    await cleanEvents();
  });

  it("ensaio não grava cache, execução nem eventos", async () => {
    await db.from("agenda_extract_cache").delete().like("url", "%teatro-cerrado.example%");
    const runsBefore = await db
      .from("agenda_collect_runs")
      .select("id", { count: "exact", head: true });
    vi.stubEnv("CRON_SECRET", "segredo-agm-t5-coleta-da-agenda-32+");
    vi.stubEnv("CRAWLER_FIXTURES", "1");
    // Relógio real: datas das fixtures de eventos acompanham o calendário (AGM-T7).
    vi.stubEnv("CRAWLER_FIXTURES_DATES", "relative");
    vi.stubEnv("AI_PROVIDER", "fake");
    const res = await POST(
      new Request("http://x/api/ingest/agenda?dry=1", {
        method: "POST",
        headers: { authorization: "Bearer segredo-agm-t5-coleta-da-agenda-32+" },
      }),
    );
    const body = (await res.json()) as { preview: { sourceId: string; evidence: unknown }[] };
    expect(body.preview.some((p) => p.sourceId === "teatro-cerrado")).toBe(true);
    const cache = await db
      .from("agenda_extract_cache")
      .select("url", { count: "exact", head: true })
      .like("url", "%teatro-cerrado.example%");
    expect(cache.count).toBe(0);
    const runsAfter = await db
      .from("agenda_collect_runs")
      .select("id", { count: "exact", head: true });
    expect(runsAfter.count).toBe(runsBefore.count);
    const ev = await db
      .from("event_listings")
      .select("id", { count: "exact", head: true })
      .in("source_id", SLUGS);
    expect(ev.count).toBe(0);
  });
});

describe("coleta repetida no banco", () => {
  it("edição travada e retirada sobrevivem à coleta seguinte, sem linha nova", async () => {
    await collectAgenda(deps({ sources: [TEATRO] }));
    const first = await db
      .from("event_listings")
      .select("id, slug, title, updated_at")
      .eq("source_id", "teatro-cerrado");
    expect(first.data).toHaveLength(2);
    const forro = first.data!.find((e) => e.title === "Forró da Praça")!;
    const fest = first.data!.find((e) => e.title === "Festival Cerrado Eletrônico")!;
    await db
      .from("event_listings")
      .update({ title: "Forró da Praça (edição da redação)", locked_fields: ["title"] })
      .eq("id", forro.id);
    await db
      .from("event_listings")
      .update({ withdrawn_at: "2026-10-03T16:00:00Z" })
      .eq("id", fest.id);

    await collectAgenda(deps({ sources: [TEATRO], now: () => new Date("2026-10-03T18:00:00Z") }));
    const second = await db
      .from("event_listings")
      .select("id, slug, title, withdrawn_at, updated_at, locked_fields")
      .eq("source_id", "teatro-cerrado");
    expect(second.data).toHaveLength(2);
    const forro2 = second.data!.find((e) => e.id === forro.id)!;
    expect(forro2.title).toBe("Forró da Praça (edição da redação)");
    expect(forro2.locked_fields).toEqual(["title"]);
    expect(forro2.slug).toBe(forro.slug);
    expect(new Date(forro2.updated_at).getTime()).toBeGreaterThan(
      new Date(forro.updated_at).getTime(),
    );
    const fest2 = second.data!.find((e) => e.id === fest.id)!;
    expect(fest2.withdrawn_at).not.toBeNull();
    await cleanEvents();
  });

  it("casa confirma evento guardado da Sympla: atualiza a mesma linha (id, chave e slug)", async () => {
    await collectAgenda(deps({ sources: [INGRESSOS] }));
    const before = await db
      .from("event_listings")
      .select("id, slug, dedupe_key, starts_at")
      .eq("title", "Festival Cerrado Eletrônico")
      .in("source_id", SLUGS);
    expect(before.data).toHaveLength(1);
    const row = before.data![0]!;
    expect(row.starts_at).toBe("2026-11-21T22:00:00+00:00");

    await collectAgenda(deps({ sources: [TEATRO, INGRESSOS] }));
    const after = await db
      .from("event_listings")
      .select("id, slug, dedupe_key, starts_at, confirmed_by_source_id, source_id")
      .eq("title", "Festival Cerrado Eletrônico")
      .in("source_id", SLUGS);
    expect(after.data).toHaveLength(1);
    expect(after.data![0]).toMatchObject({
      id: row.id,
      slug: row.slug,
      dedupe_key: row.dedupe_key,
      confirmed_by_source_id: TEATRO.uuid,
      starts_at: "2026-11-21T23:00:00+00:00",
    });
    await cleanEvents();
  });
});

describe("estado da fonte de eventos", () => {
  it("3 falhas seguidas pausam a fonte com auto_failures e avisam o Control Center", async () => {
    const ins = await db
      .from("sources")
      .insert({
        slug: BROKEN_SLUG,
        name: "Fonte quebrada fictícia",
        base_url: "https://quebrada-agm.example/agenda",
        kind: "events",
        locality: "cuiaba",
        status: "active",
        extract_kind: "jsonld",
        event_origin: "organizer",
      })
      .select("id")
      .single();
    expect(ins.error).toBeNull();
    const id = ins.data!.id;
    const source: AgendaSource = (await loadEventSources(db)).find((s) => s.uuid === id)!;
    expect(source.enabled).toBe(true);
    for (let i = 0; i < 3; i++) await collectAgenda(deps({ sources: [source] }));
    const row = await db
      .from("sources")
      .select("status, status_reason, consecutive_failures, last_error")
      .eq("id", id)
      .single();
    expect(row.data).toMatchObject({
      status: "paused",
      status_reason: "auto_failures",
      consecutive_failures: 3,
      last_error: "HTTP 404",
    });
    const note = await db.from("notifications").select("kind").eq("object_ref", `source:${id}`);
    expect(note.data?.map((n) => n.kind)).toEqual(["source_auto_paused"]);
    // Pausada: a coleta seguinte não a reativa (só ativa/com falhas são atualizadas).
    await store.sourceState(id, "ok");
    const still = await db.from("sources").select("status").eq("id", id).single();
    expect(still.data?.status).toBe("paused");
  });
});
