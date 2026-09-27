// @vitest-environment node
import { afterAll, describe, expect, it } from "vitest";
import { createServiceClient } from "@/lib/db/client";
import {
  getArticleBySlug,
  getEvent,
  getHomeData,
  getTopicBySlug,
  listAggregated,
  listEvents,
  listSection,
} from "@/lib/db/queries";

function value<T>(r: { ok: true; value: T } | { ok: false; error: unknown }): T {
  if (!r.ok) throw new Error(`leitura falhou: ${JSON.stringify(r.error)}`);
  return r.value;
}

describe("queries públicas (P1-T1)", () => {
  it("home traz manchete publicada e agregados só de fontes com política", async () => {
    const h = value(await getHomeData());
    expect(h.lead?.status).toMatch(/published|updated/);
    expect(h.aggregated.length).toBeGreaterThan(0);
    expect(h.aggregated.every((a) => a.labels.shown[0]!.kind === "aggregated")).toBe(true);
    expect(new Set(h.aggregated.map((a) => a.sourceSlug)).size).toBe(h.aggregated.length);
    expect(h.now.length).toBeLessThanOrEqual(6);
    expect(h.topics).toHaveLength(3);
    expect(h.collections).toHaveLength(4);
    expect(h.events.length).toBeLessThanOrEqual(3);
    expect(h.mostRead).toHaveLength(5);
    expect(h.urgent).toBeNull();
    for (const a of [h.lead!, ...h.now]) {
      expect(a.labels.shown.length).toBeGreaterThan(0);
      expect(a.labels.shown.length).toBeLessThanOrEqual(4);
    }
  });

  it("matéria normalizada tem rótulos, fontes com link e histórico", async () => {
    const r = value(await getArticleBySlug("prefeitura-detalha-novo-plano-de-onibus-cpa-centro"));
    if (!r || "gone" in r) throw new Error("esperava matéria");
    expect(r.labels.shown.map((l) => l.kind)).toEqual([
      "normalized",
      "ai_summary",
      "human_reviewed",
    ]);
    expect(r.labels.shown[0]!.detail).toBe("4 fontes");
    expect(r.sources[0]!.role).toBe("primary");
    expect(r.sources.every((s) => s.url.startsWith("https://"))).toBe(true);
    expect(r.versions).toBe(1);
    expect(r.body.length).toBeGreaterThan(0);
    expect(r.topic?.slug).toBe("plano-de-onibus-cpa-centro");
  });

  it("matéria arquivada retorna gone", async () => {
    expect(value(await getArticleBySlug("materia-arquivada-seed"))).toEqual({
      gone: true,
      reason: expect.any(String),
    });
  });

  it("slug inexistente retorna null", async () => {
    expect(value(await getArticleBySlug("nao-existe"))).toBeNull();
  });

  it("assunto traz matérias e agregados", async () => {
    const t = value(await getTopicBySlug("plano-de-onibus-cpa-centro"));
    expect(t?.articles.length).toBeGreaterThanOrEqual(2);
    expect(t?.aggregated.every((a) => a.labels.shown[0]!.kind === "aggregated")).toBe(true);
    expect(value(await getTopicBySlug("nao-existe"))).toBeNull();
  });

  it("editoria pagina e filtra por origem", async () => {
    const all = value(await listSection("cidade", {}, 1));
    expect(all?.articles.length).toBeGreaterThan(0);
    const originals = value(await listSection("cidade", { origin: "original" }, 1));
    expect(originals?.articles.every((a) => a.kind === "original")).toBe(true);
    expect(value(await listSection("nao-existe", {}, 1))).toBeNull();
  });

  it("agenda lista eventos futuros em ordem e abre um evento", async () => {
    const events = value(await listEvents({ from: "2026-10-01T00:00:00-04:00", freeOnly: true }));
    expect(events.length).toBeGreaterThan(0);
    expect(events.every((e) => e.isFree)).toBe(true);
    const starts = events.map((e) => e.startsAt);
    expect([...starts].sort()).toEqual(starts);
    expect(value(await getEvent("corrida-noturna-do-cpa"))?.priceCents).toBe(4500);
  });

  it("agregados por fonte levam ao original", async () => {
    const items = value(await listAggregated({ sourceSlugs: ["folha-do-cerrado"], limit: 5 }));
    expect(items.every((i) => i.url.startsWith("https://folhadocerrado.example/"))).toBe(true);
  });

  describe("urgente publicado por humano", () => {
    const slug = "defesa-civil-mantem-alerta-de-baixa-umidade";
    afterAll(async () => {
      await createServiceClient().from("articles").update({ urgent: false }).eq("slug", slug);
    });
    it("aparece como urgente e não como manchete", async () => {
      await createServiceClient().from("articles").update({ urgent: true }).eq("slug", slug);
      const h = value(await getHomeData());
      expect(h.urgent?.slug).toBe(slug);
      expect(h.lead?.slug).not.toBe(slug);
    });
  });
});

describe("sem variáveis do Supabase", () => {
  it("devolve erro tipado em vez de lançar", async () => {
    const saved = process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    try {
      const r = await getHomeData();
      expect(r).toEqual({ ok: false, error: { kind: "unconfigured" } });
    } finally {
      process.env.NEXT_PUBLIC_SUPABASE_URL = saved;
    }
  });
});
