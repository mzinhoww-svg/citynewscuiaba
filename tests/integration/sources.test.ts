// @vitest-environment node
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { createServiceClient } from "@/lib/db/client";
import { getRecConfig, getSource, getSourceSignals, listSourceItems } from "@/lib/db/queries";
import { DEFAULT_REC_CONFIG } from "@/lib/ranking";

function value<T>(r: { ok: true; value: T } | { ok: false; error: unknown }): T {
  if (!r.ok) throw new Error(`leitura falhou: ${JSON.stringify(r.error)}`);
  return r.value;
}

const db = createServiceClient();
const anonId = randomUUID();

afterAll(async () => {
  await db.from("events").delete().eq("anon_id", anonId);
  await db.from("sources").update({ rec_excluded: false }).eq("slug", "brasil-hoje");
});

describe("sinais de fonte (P2-T5)", () => {
  it("fonte com 3 falhas seguidas tem operational ≤ 0,2", async () => {
    const s = value(await getSourceSignals({ window: "7d" })).find(
      (x) => x.slug === "cena-cuiabana",
    )!;
    expect(s.operational).toBeLessThanOrEqual(0.2);
    const ok = value(await getSourceSignals({ window: "7d" })).find(
      (x) => x.slug === "folha-do-cerrado",
    )!;
    expect(ok.operational).toBeGreaterThan(0.9);
  });

  it("sem anonId, individual = 0", async () => {
    expect(value(await getSourceSignals({ window: "7d" })).every((s) => s.individual === 0)).toBe(
      true,
    );
  });

  it("popularidade normalizada, tendência e dados do card", async () => {
    const list = value(await getSourceSignals({ window: "7d" }));
    expect(list).toHaveLength(12);
    const by = new Map(list.map((s) => [s.slug, s]));
    expect(by.get("folha-do-cerrado")!.popularity).toBe(1);
    expect(by.get("placar-mt")!.trendDirection).toBe("up");
    expect(by.get("placar-mt")!.trend).toBe(1);
    expect(by.get("correio-mato-grossense")!.trendDirection).toBe("down");
    expect(by.get("folha-do-cerrado")!.reach).toBeGreaterThan(10_000);
    expect(by.get("folha-do-cerrado")).toMatchObject({
      name: "Folha do Cerrado",
      verified: true,
      locality: "cuiaba",
    });
    for (const s of list) {
      expect(s.popularity).toBeGreaterThanOrEqual(0);
      expect(s.popularity).toBeLessThanOrEqual(1);
    }
  });

  it("filtra por localidade e editoria depois de normalizar", async () => {
    const mt = value(await getSourceSignals({ window: "7d", locality: "mt" }));
    expect(mt.length).toBeGreaterThan(0);
    expect(mt.every((s) => s.locality === "mt")).toBe(true);
    const cultura = value(await getSourceSignals({ window: "1d", category: "cultura" }));
    expect(cultura.map((s) => s.slug)).toEqual(["cena-cuiabana"]);
  });

  it("com anonId e leitura qualificada, individual > 0 só na fonte lida", async () => {
    const now = Date.now();
    const base = {
      anon_id: anonId,
      session: { id: "s", page: "/", referrer: null, device: "mobile" },
      consent: { version: "v1", metrics: true, personalization: true },
      algo_version: "rec-v1",
    };
    const { error } = await db.from("events").insert([
      {
        ...base,
        name: "article_read",
        at: new Date(now - 3_600_000).toISOString(),
        source_slug: "mt-agora",
        props: { seconds: 80, scrollPct: 70 },
      },
      {
        ...base,
        name: "source_followed",
        at: new Date(now - 3_000_000).toISOString(),
        source_slug: "mt-agora",
        props: { surface: "fontes", fromRecommendation: false },
      },
      {
        ...base,
        name: "article_opened",
        at: new Date(now - 2_000_000).toISOString(),
        source_slug: "placar-mt",
        props: { kind: "aggregated", position: 1 },
      },
    ]);
    expect(error).toBeNull();
    const list = value(await getSourceSignals({ window: "7d", anonId }));
    const by = new Map(list.map((s) => [s.slug, s]));
    expect(by.get("mt-agora")!.individual).toBeGreaterThan(0);
    expect(by.get("mt-agora")!.followed).toBe(true);
    // Clique isolado é sinal fraco: não vira preferência.
    expect(by.get("placar-mt")!.individual).toBe(0);
    expect(list.filter((s) => s.individual > 0).map((s) => s.slug)).toEqual(["mt-agora"]);
  });

  it("anonId inválido é ignorado (sem erro, individual = 0)", async () => {
    const list = value(await getSourceSignals({ window: "7d", anonId: "nao-e-uuid" }));
    expect(list.every((s) => s.individual === 0)).toBe(true);
  });

  it("rec_excluded passa para os sinais", async () => {
    await db.from("sources").update({ rec_excluded: true }).eq("slug", "brasil-hoje");
    const s = value(await getSourceSignals({ window: "7d" })).find((x) => x.slug === "brasil-hoje");
    expect(s?.excluded).toBe(true);
  });

  it("refresh_source_stats_daily consolida eventos do dia e é idempotente", async () => {
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Cuiaba" }).format(new Date());
    const first = await db.rpc("refresh_source_stats_daily", { p_day: day });
    expect(first.error).toBeNull();
    const again = await db.rpc("refresh_source_stats_daily", { p_day: day });
    expect(again.data).toBe(first.data);
    const { data } = await db
      .from("source_stats_daily")
      .select("reads, follows, sources!inner(slug)")
      .eq("day", day)
      .eq("sources.slug", "mt-agora")
      .single();
    expect(data?.reads).toBeGreaterThanOrEqual(1);
    expect(data?.follows).toBeGreaterThanOrEqual(1);
    await db.from("source_stats_daily").delete().eq("day", day);
  });
});

describe("pesos de recomendação", () => {
  it("lê o rec-v1 ativo do seed", async () => {
    const c = await getRecConfig();
    expect(c.version).toBe("rec-v1");
    expect(c.weights.popularity).toBe(0.35);
    expect(c.cap).toBe(0.25);
    expect(c.discoveryEvery).toBe(5);
  });

  it("sem Supabase configurado cai nos padrões da spec", async () => {
    const saved = process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    try {
      expect(await getRecConfig()).toEqual(DEFAULT_REC_CONFIG);
    } finally {
      process.env.SUPABASE_SERVICE_ROLE_KEY = saved;
    }
  });
});

describe("fonte e itens", () => {
  it("getSource devolve a fonte com sinais; inexistente = null", async () => {
    const s = value(await getSource("mt-agora"));
    expect(s?.name).toBe("MT Agora");
    expect(s?.baseUrl).toBe("https://mtagora.example");
    expect(value(await getSource("nao-existe"))).toBeNull();
  });

  it("listSourceItems traz só itens da fonte, com link para o original", async () => {
    const items = value(await listSourceItems("mt-agora"));
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((i) => i.sourceSlug === "mt-agora")).toBe(true);
    expect(items.every((i) => i.url.startsWith("https://mtagora.example/"))).toBe(true);
  });
});
