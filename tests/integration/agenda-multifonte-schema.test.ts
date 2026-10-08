// @vitest-environment node
// AGM-T1: colunas de evento em `sources`, `event_listings` com retirada/origem newsroom, cache de
// extração só da service role e seed das fontes de eventos.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { createPublicClient, createServiceClient } from "@/lib/db/client";
import { createIngestRepo } from "@/lib/db/pipeline-store";
import { collectNow } from "@/lib/pipeline/collect-now";
import { activateSource } from "@/lib/pipeline/activate-source";

const db = createServiceClient();
const anon = createPublicClient();
const SLUG = "agm-t1-fixture";
const slugs: string[] = [];

const listing = (slug: string, extra: Record<string, unknown> = {}) => ({
  slug,
  title: `Evento ${slug}`,
  starts_at: "2027-03-10T22:00:00Z",
  venue: "Teatro Fictício",
  category: "Música",
  origin: "organizer",
  confirmed_at: "2026-10-08T12:00:00Z",
  ...extra,
});

afterAll(async () => {
  if (slugs.length) await db.from("event_listings").delete().in("slug", slugs);
  await db.from("sources").delete().eq("slug", SLUG);
  await db.from("agenda_extract_cache").delete().eq("url", "https://cache.example/a");
});

describe("event_listings: retirada e origem newsroom", () => {
  it("anônimo não lê evento retirado e lê o mesmo depois de devolvido", async () => {
    slugs.push("agm-t1-retirado");
    const ins = await db
      .from("event_listings")
      .insert(listing("agm-t1-retirado", { withdrawn_at: "2026-10-08T13:00:00Z" }));
    expect(ins.error).toBeNull();
    const hidden = await anon.from("event_listings").select("slug").eq("slug", "agm-t1-retirado");
    expect(hidden.data).toEqual([]);

    await db.from("event_listings").update({ withdrawn_at: null }).eq("slug", "agm-t1-retirado");
    const shown = await anon.from("event_listings").select("slug").eq("slug", "agm-t1-retirado");
    expect(shown.data).toEqual([{ slug: "agm-t1-retirado" }]);
  });

  it("aceita origin = 'newsroom' e recusa origem desconhecida", async () => {
    slugs.push("agm-t1-newsroom", "agm-t1-xx");
    const ok = await db
      .from("event_listings")
      .insert(listing("agm-t1-newsroom", { origin: "newsroom" }));
    expect(ok.error).toBeNull();
    const bad = await db.from("event_listings").insert(listing("agm-t1-xx", { origin: "robot" }));
    expect(bad.error).not.toBeNull();
  });
});

describe("sources: fonte de eventos", () => {
  const base = {
    slug: SLUG,
    name: "Fonte fictícia de eventos",
    base_url: "https://agenda-ficticia.example/",
    kind: "events" as const,
    locality: "cuiaba",
    status: "paused" as const,
  };

  it("kind = 'events' sem extract_kind/event_origin é recusado pelo check", async () => {
    const r = await db.from("sources").insert(base);
    expect(r.error).not.toBeNull();
    const r2 = await db.from("sources").insert({ ...base, extract_kind: "ai_page" });
    expect(r2.error).not.toBeNull();
  });

  it("com extract_kind e event_origin é aceito, com padrões das colunas novas", async () => {
    const r = await db
      .from("sources")
      .insert({ ...base, extract_kind: "ai_page", event_origin: "organizer" })
      .select("confirms, collector_notes, list_urls, require_city")
      .single();
    expect(r.error).toBeNull();
    expect(r.data).toEqual({
      confirms: false,
      collector_notes: [],
      list_urls: [],
      require_city: false,
    });
  });

  it("extract_kind fora da lista é recusado", async () => {
    const r = await db
      .from("sources")
      .insert({ ...base, slug: `${SLUG}-2`, extract_kind: "magia", event_origin: "official" });
    expect(r.error).not.toBeNull();
  });
});

describe("seed das fontes de eventos", () => {
  it("só as 3 do Sympla estão ativas", async () => {
    const { data } = await db
      .from("sources")
      .select("slug")
      .eq("kind", "events")
      .eq("status", "active");
    expect((data ?? []).map((s) => s.slug).sort()).toEqual([
      "sympla-cuiaba-1",
      "sympla-cuiaba-2",
      "sympla-varzea-grande",
    ]);
  });

  it("cine-teatro-cuiaba: pausado, aguardando ativação, confirma fatos, com páginas 1..4", async () => {
    const { data } = await db
      .from("sources")
      .select(
        "status, status_reason, confirms, extract_kind, event_origin, list_urls, collector_notes",
      )
      .eq("slug", "cine-teatro-cuiaba")
      .single();
    expect(data).toMatchObject({
      status: "paused",
      status_reason: "pending_activation",
      confirms: true,
      extract_kind: "ai_page",
      event_origin: "organizer",
    });
    expect(data?.list_urls).toHaveLength(4);
    expect(data?.collector_notes.length).toBeGreaterThan(0);
  });

  it("bloqueadas trazem motivo", async () => {
    const { data } = await db
      .from("sources")
      .select("slug, status, status_reason, last_error")
      .in("slug", ["prefeitura-cuiaba-e-eventos", "mapas-mt", "cuiaba-tem"]);
    expect(data).toHaveLength(3);
    for (const s of data ?? []) {
      expect(s.status).toBe("blocked");
      expect(["legal", "other"]).toContain(s.status_reason);
      expect(s.last_error).toBeTruthy();
    }
  });

  it("as 3 do Sympla têm nome público 'Sympla'", async () => {
    const { data } = await anon
      .from("public_event_sources")
      .select("name, id")
      .in(
        "id",
        (
          await db
            .from("sources")
            .select("id")
            .in("slug", ["sympla-cuiaba-1", "sympla-cuiaba-2", "sympla-varzea-grande"])
        ).data!.map((r) => r.id),
      );
    expect((data ?? []).map((r) => r.name)).toEqual(["Sympla", "Sympla", "Sympla"]);
  });

  it("public_event_sources mantém o nome de fonte bloqueada (origem sempre visível)", async () => {
    const src = await db.from("sources").select("id, name").eq("slug", "cuiaba-tem").single();
    const { data } = await anon.from("public_event_sources").select("name").eq("id", src.data!.id);
    expect(data).toEqual([{ name: src.data!.name }]);
  });

  it("backfill do 0196 liga source_ref das linhas coletadas pelo slug da fonte", () => {
    const DB_URL =
      process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
    const psql = (sql: string): string =>
      execFileSync("psql", [DB_URL, "-At", "-v", "ON_ERROR_STOP=1", "-c", sql], {
        encoding: "utf8",
        env: { ...process.env, PGOPTIONS: "-c client_min_messages=warning" },
      }).trim();
    const migration = readFileSync(
      join(process.cwd(), "supabase/migrations/0196_agenda_sources_seed.sql"),
      "utf8",
    );
    const backfill = /-- backfill:start\n([\s\S]*?)-- backfill:end/.exec(migration)?.[1];
    expect(backfill).toBeTruthy();
    slugs.push("agm-bf-sympla", "agm-bf-outra", "agm-bf-ja-ligada");
    const cine = psql("select id from sources where slug = 'cine-teatro-cuiaba'");
    psql(`insert into event_listings (slug, title, starts_at, venue, category, origin, confirmed_at, source_id, source_ref) values
      ('agm-bf-sympla', 'Evento agm-bf-sympla', '2027-03-10T22:00:00Z', 'Teatro Fictício', 'Música', 'organizer', now(), 'sympla-cuiaba-2', null),
      ('agm-bf-outra', 'Evento agm-bf-outra', '2027-03-10T22:00:00Z', 'Teatro Fictício', 'Música', 'organizer', now(), 'fonte-que-nao-existe', null),
      ('agm-bf-ja-ligada', 'Evento agm-bf-ja-ligada', '2027-03-10T22:00:00Z', 'Teatro Fictício', 'Música', 'organizer', now(), 'sympla-cuiaba-2', '${cine}')`);
    psql(backfill!);
    const rows = psql(
      "select e.slug || '=' || coalesce(s.slug, '') from event_listings e left join sources s on s.id = e.source_ref where e.slug like 'agm-bf-%' order by e.slug",
    ).split("\n");
    expect(rows).toEqual([
      "agm-bf-ja-ligada=cine-teatro-cuiaba",
      "agm-bf-outra=",
      "agm-bf-sympla=sympla-cuiaba-2",
    ]);
  });

  it("public_sources não expõe fonte de eventos", async () => {
    const { data } = await db.from("public_sources").select("slug").eq("kind", "events");
    expect(data).toEqual([]);
  });
});

describe("agenda_extract_cache, agenda_collect_runs e configurações", () => {
  it("anônimo não lê o cache; service role grava e lê", async () => {
    const row = { url: "https://cache.example/a", content_hash: "h1", result: { ok: true } };
    const w = await db.from("agenda_extract_cache").insert(row);
    expect(w.error).toBeNull();
    const a = await anon.from("agenda_extract_cache").select("url");
    expect(a.data ?? []).toEqual([]);
    const s = await db.from("agenda_extract_cache").select("url").eq("url", row.url);
    expect(s.data).toHaveLength(1);
  });

  it("agenda_collect_runs ganha source_id, stats e ai_pages", async () => {
    const { data, error } = await db
      .from("agenda_collect_runs")
      .select("source_id, stats, ai_pages")
      .limit(1);
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
  });

  it("tetos de IA da Agenda e agente event_extractor", async () => {
    const { data } = await db
      .from("app_settings")
      .select("key, value")
      .in("key", ["agenda.ai_pages_per_run", "agenda.ai_pages_per_day"]);
    expect(Object.fromEntries((data ?? []).map((r) => [r.key, r.value]))).toEqual({
      "agenda.ai_pages_per_run": 40,
      "agenda.ai_pages_per_day": 160,
    });
    const agent = await db
      .from("ai_agents")
      .select("model_id, fallback_model_id, daily_budget_brl")
      .eq("id", "event_extractor")
      .single();
    expect(agent.data).toMatchObject({
      model_id: "google/gemini-2.5-flash",
      fallback_model_id: "openai/gpt-4o-mini",
    });
    expect(Number(agent.data?.daily_budget_brl)).toBe(1);
    const prompt = await db
      .from("ai_prompts")
      .select("status")
      .eq("agent_id", "event_extractor")
      .eq("version", 1)
      .single();
    expect(prompt.data?.status).toBe("production");
  });
});

describe("fonte de eventos fora da coleta de notícias", () => {
  it("collectNow numa fonte de eventos ativa devolve not_found", async () => {
    const repo = createIngestRepo(db);
    const { data } = await db.from("sources").select("id").eq("slug", "sympla-cuiaba-1").single();
    const r = await collectNow(data!.id, {
      repo,
      actor: "00000000-0000-0000-0000-000000000000",
    } as unknown as Parameters<typeof collectNow>[1]);
    expect(r).toMatchObject({ ok: false, error: "not_found" });
  });

  it("activateSource (notícias) não encontra fonte de eventos", async () => {
    const repo = createIngestRepo(db);
    const r = await activateSource("cine-teatro-cuiaba", {
      repo,
    } as unknown as Parameters<typeof activateSource>[1]);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toContain("não encontrada");
  });
});
