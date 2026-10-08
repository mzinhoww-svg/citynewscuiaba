// @vitest-environment node
// AGM-T6: prévia ("Testar conexão") e "Coletar agora" de uma fonte de eventos do painel, com a
// mesma fiação da rota da Agenda. Fixtures fictícias (CRAWLER_FIXTURES=1, AI_PROVIDER=fake).
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createServiceClient } from "@/lib/db/client";
import { collectEventSource, previewEventSource } from "@/lib/db/agenda-collect";
import { createAgendaStore } from "@/lib/db/agenda-store";
import {
  agendaRejections,
  agendaSourceRuns,
  rejectionsFromRuns,
} from "@/lib/db/queries/agenda-runs";

const db = createServiceClient();
const store = createAgendaStore(db);
const ID = "f6000000-0000-4000-8000-000000000001";
const SLUG = "agm-t6-teatro";

async function clean() {
  await db.from("event_listings").delete().eq("source_id", SLUG);
  await db.from("agenda_collect_runs").delete().eq("source_id", ID);
  await db.from("agenda_extract_cache").delete().like("url", "%teatro-cerrado.example%");
}

beforeAll(async () => {
  vi.stubEnv("CRAWLER_FIXTURES", "1");
  vi.stubEnv("AI_PROVIDER", "fake");
  await db.from("sources").delete().eq("id", ID);
  const ins = await db.from("sources").insert({
    id: ID,
    slug: SLUG,
    name: "Teatro do painel (fictício)",
    base_url: "https://teatro-cerrado.example/",
    kind: "events",
    locality: "cuiaba",
    status: "paused",
    status_reason: "pending_activation",
    extract_kind: "ai_page",
    event_origin: "organizer",
    confirms: true,
  });
  if (ins.error) throw new Error(ins.error.message);
  await clean();
});

afterAll(async () => {
  vi.unstubAllEnvs();
  await clean();
  await db.from("sources").delete().eq("id", ID);
});

describe("previewEventSource", () => {
  it("fonte pausada: até 5 eventos com evidência e as recusas, sem gravar nada", async () => {
    const before = await store.aiPagesToday(new Date());
    const r = await previewEventSource(ID);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.status).toBe("ok");
    expect(r.value.events.map((e) => e.title).sort()).toEqual([
      "Festival Cerrado Eletrônico",
      "Forró da Praça",
    ]);
    const forro = r.value.events.find((e) => e.title === "Forró da Praça")!;
    expect(forro.evidence.data?.trecho).toBe("sábado, 24 de outubro de 2026");
    expect(r.value.rejected).toEqual([
      { url: "https://teatro-cerrado.example/evento/sarau-de-verao", reason: "sem_ano" },
    ]);
    // Ensaio: nada gravado e nada conta no teto do dia.
    const runs = await db.from("agenda_collect_runs").select("id").eq("source_id", ID);
    expect(runs.data).toEqual([]);
    const events = await db.from("event_listings").select("id").eq("source_id", SLUG);
    expect(events.data).toEqual([]);
    const cache = await db
      .from("agenda_extract_cache")
      .select("url")
      .like("url", "%teatro-cerrado.example%");
    expect(cache.data).toEqual([]);
    expect(await store.aiPagesToday(new Date())).toBe(before);
    const src = await db.from("sources").select("status, last_fetched_at").eq("id", ID).single();
    expect(src.data).toMatchObject({ status: "paused", last_fetched_at: null });
  });

  it("id desconhecido: erro", async () => {
    const r = await previewEventSource("f6000000-0000-4000-8000-0000000000ff");
    expect(r.ok).toBe(false);
  });
});

describe("collectEventSource", () => {
  it("coleta só esta fonte, grava os eventos e uma linha por fonte (sem linha-resumo)", async () => {
    await db.from("sources").update({ status: "active", status_reason: null }).eq("id", ID);
    const lastBefore = await store.lastRunStartedAt();
    const r = await collectEventSource(ID);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toMatchObject({ status: "ok", found: 3, approved: 2, new: 2 });
    const runs = await db
      .from("agenda_collect_runs")
      .select("source_id, trigger, ai_pages, stats")
      .eq("source_id", ID);
    expect(runs.data).toHaveLength(1);
    expect(runs.data![0]).toMatchObject({ trigger: "manual", ai_pages: 4 });
    expect((await store.lastRunStartedAt())?.toISOString()).toBe(lastBefore?.toISOString());
    const events = await db
      .from("event_listings")
      .select("title, source_ref")
      .eq("source_id", SLUG);
    expect(events.data).toHaveLength(2);
    expect(events.data!.every((e) => e.source_ref === ID)).toBe(true);
  });

  it("agendaSourceRuns e agendaRejections leem a execução por fonte (service role)", async () => {
    const rows = await db
      .from("agenda_collect_runs")
      .select("id, started_at, finished_at, trigger, ai_pages, stats")
      .eq("source_id", ID);
    const rejections = rejectionsFromRuns(rows.data ?? []);
    expect(rejections).toEqual([
      expect.objectContaining({
        url: "https://teatro-cerrado.example/evento/sarau-de-verao",
        reason: "sem_ano",
      }),
    ]);
    // As leituras do painel exigem sessão com `source.manage`: fora do Estúdio, erro (nunca lança).
    expect((await agendaSourceRuns(ID)).ok).toBe(false);
    expect((await agendaRejections(ID)).ok).toBe(false);
  });
});
