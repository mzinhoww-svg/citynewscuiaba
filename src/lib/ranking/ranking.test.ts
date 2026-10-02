import { describe, expect, it } from "vitest";
import { REASON_TEXT } from "@/content/pt-BR/recommendations";
import {
  DEFAULT_REC_CONFIG,
  REC_V1,
  capItems,
  effectiveWeights,
  explainRecommendation,
  rankSources,
  scoreSource,
  type RankList,
  type RankedSource,
  type SourceSignals,
} from "./index";
import { parseRecConfig } from "./config";

/** PRNG determinístico (mulberry32): propriedades com listas aleatórias e seed fixa. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sig(slug: string, over: Partial<SourceSignals> = {}): SourceSignals {
  return {
    slug,
    locality: "mt",
    popularity: 0.5,
    individual: 0,
    recency: 0.5,
    engagement: 0.5,
    operational: 1,
    diversity: 0,
    trend: 0.5,
    followed: false,
    pinned: false,
    excluded: false,
    blocked: false,
    isNewForUser: true,
    localHighlight: false,
    verified: false,
    ...over,
  };
}

function ranked(slug: string, over: Partial<RankedSource> = {}): RankedSource {
  return { ...sig(slug), score: 0.5, reason: "regional_popular", discovery: false, ...over };
}

/** 10 fontes: 6 já lidas pelo leitor (individual > 0) e 4 pouco exploradas (descoberta). */
function fixtureTen(): SourceSignals[] {
  return [
    sig("fc", { individual: 0.9, popularity: 0.9, locality: "cuiaba", isNewForUser: false }),
    sig("db", { individual: 0.8, popularity: 0.8, locality: "cuiaba", isNewForUser: false }),
    sig("ma", { individual: 0.7, popularity: 0.7, isNewForUser: false, matchesTopic: true }),
    sig("rp", { individual: 0.6, popularity: 0.6, locality: "cuiaba", isNewForUser: false }),
    sig("cm", { individual: 0.5, popularity: 0.5, isNewForUser: false, recentVisit: true }),
    sig("ag", { individual: 0.4, popularity: 0.4, isNewForUser: false, similar: true }),
    sig("cc", { diversity: 0.9, popularity: 0.2, locality: "cuiaba" }),
    sig("pl", { diversity: 0.8, popularity: 0.3 }),
    sig("do", { diversity: 0.7, popularity: 0.1, locality: "cuiaba" }),
    sig("bh", { diversity: 0.6, popularity: 0.4, locality: "nacional" }),
  ];
}

function fixtureWithFlags(): SourceSignals[] {
  return [
    sig("fc", { popularity: 0.9 }),
    sig("pv", { popularity: 0.95 }),
    sig("bl", { popularity: 0.99, blocked: true }),
    sig("ex", { popularity: 0.98, excluded: true }),
    sig("ag", { popularity: 0.1, pinned: true }),
    sig("ma", { popularity: 0.6 }),
    sig("db", { popularity: 0.5 }),
  ];
}

const LISTS: RankList[] = [
  "popular",
  "trending",
  "recommended",
  "followed",
  "local",
  "verified",
  "new",
];
const FIXED_TEXTS = new Set<string>(
  Object.values(REASON_TEXT).flatMap((t) => (typeof t === "string" ? [t] : [])),
);

function randomSignals(r: () => number, n: number): SourceSignals[] {
  const localities = ["cuiaba", "varzea-grande", "mt", "nacional"];
  return [...Array(n)].map((_, i) =>
    sig(`s${i}`, {
      locality: localities[Math.floor(r() * localities.length)]!,
      popularity: r(),
      individual: r() < 0.5 ? 0 : r(),
      recency: r(),
      engagement: r(),
      operational: r(),
      diversity: r() < 0.2 ? 0 : r(),
      trend: r(),
      followed: r() < 0.2,
      pinned: r() < 0.1,
      excluded: r() < 0.1,
      blocked: r() < 0.05,
      isNewForUser: r() < 0.6,
      localHighlight: r() < 0.2,
      verified: r() < 0.4,
      recentVisit: r() < 0.2,
      matchesSearch: r() < 0.1,
      matchesTopic: r() < 0.2,
      similar: r() < 0.2,
    }),
  );
}

describe("scoreSource (spec §7.1)", () => {
  it("sem personalização o peso individual some e os demais somam 1", () => {
    const s = {
      ...sig("fc"),
      popularity: 1,
      individual: 1,
      recency: 0,
      engagement: 0,
      operational: 0,
      diversity: 0,
    };
    expect(scoreSource(s, REC_V1, false)).toBeCloseTo(0.35 / 0.75, 5);
    expect(scoreSource(s, REC_V1, true)).toBeCloseTo(0.6, 5);
  });

  it("pesos rec-v1 exatos", () => {
    expect(REC_V1).toEqual({
      popularity: 0.35,
      individual: 0.25,
      recency: 0.15,
      engagement: 0.1,
      operational: 0.1,
      diversity: 0.05,
    });
  });

  it("renormaliza sem personalização: individual = 0 e soma 1", () => {
    const w = effectiveWeights(REC_V1, false);
    expect(w.individual).toBe(0);
    const sum = Object.values(w).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 10);
    expect(w.popularity).toBeCloseTo(0.35 / 0.75, 10);
  });

  it("propriedade: score em [0, 1] e, sem personalização, independente do sinal individual", () => {
    const r = rng(20260927);
    for (let i = 0; i < 500; i++) {
      const [s] = randomSignals(r, 1);
      const a = scoreSource(s!, REC_V1, false);
      const b = scoreSource({ ...s!, individual: r() }, REC_V1, false);
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThanOrEqual(1);
      expect(a).toBeCloseTo(b, 12);
      const p = scoreSource(s!, REC_V1, true);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    }
  });

  it("componentes fora de [0, 1] são limitados", () => {
    expect(
      scoreSource(sig("x", { popularity: 5, operational: -3 }), REC_V1, true),
    ).toBeLessThanOrEqual(1);
  });
});

describe("pesos do banco com fallback", () => {
  it("usa o registro ativo quando válido", () => {
    const c = parseRecConfig({
      version: "rec-v2",
      weights: { ...REC_V1, popularity: 0.3, diversity: 0.1 },
      cap: 0.2,
      discovery_every: 4,
    });
    expect(c.version).toBe("rec-v2");
    expect(c.weights.diversity).toBe(0.1);
    expect(c.cap).toBe(0.2);
    expect(c.discoveryEvery).toBe(4);
  });

  it.each([
    ["sem registro", null],
    [
      "pesos incompletos",
      { version: "x", weights: { popularity: 1 }, cap: 0.25, discovery_every: 5 },
    ],
    [
      "soma diferente de 1",
      { version: "x", weights: { ...REC_V1, popularity: 0.9 }, cap: 0.25, discovery_every: 5 },
    ],
    [
      "peso negativo",
      {
        version: "x",
        weights: { ...REC_V1, popularity: 0.45, diversity: -0.05 },
        cap: 0.25,
        discovery_every: 5,
      },
    ],
    ["teto inválido", { version: "x", weights: REC_V1, cap: 0, discovery_every: 5 }],
  ])("%s → padrões da spec (rec-v1)", (_, raw) => {
    expect(parseRecConfig(raw)).toEqual(DEFAULT_REC_CONFIG);
  });
});

describe("capItems (teto de 25%)", () => {
  it("teto de 25% em lista de itens", () => {
    const items = [...Array(6)]
      .map(() => ({ sourceSlug: "fc" }))
      .concat([{ sourceSlug: "ma" }, { sourceSlug: "db" }, { sourceSlug: "rp" }]);
    expect(capItems(items, 8, 0.25).filter((i) => i.sourceSlug === "fc")).toHaveLength(2);
  });

  it("Review Focus 3: fonte com 80% dos cliques aparece no máximo 2 vezes em 8 itens", () => {
    const items = [...Array(40)].map((_, i) => ({
      id: i,
      sourceSlug: i % 5 === 4 ? `outra-${i}` : "dominante",
    }));
    const out = capItems(items, 8, 0.25);
    expect(out).toHaveLength(8);
    expect(out.filter((i) => i.sourceSlug === "dominante")).toHaveLength(2);
  });

  it("propriedade: teto, limite, ordem preservada e preenchimento máximo", () => {
    const r = rng(7);
    for (let round = 0; round < 300; round++) {
      const nSources = 1 + Math.floor(r() * 6);
      const items = [...Array(Math.floor(r() * 40))].map((_, id) => ({
        id,
        // Distribuição enviesada: a fonte 0 domina.
        sourceSlug: `f${r() < 0.6 ? 0 : Math.floor(r() * nSources)}`,
      }));
      const limit = 1 + Math.floor(r() * 12);
      const cap = [0.25, 0.2, 0.5][Math.floor(r() * 3)]!;
      const max = Math.ceil(limit * cap);
      const out = capItems(items, limit, cap);
      expect(out.length).toBeLessThanOrEqual(limit);
      const counts = new Map<string, number>();
      for (const i of out) counts.set(i.sourceSlug, (counts.get(i.sourceSlug) ?? 0) + 1);
      for (const n of counts.values()) expect(n).toBeLessThanOrEqual(max);
      // Ordem preservada (subsequência).
      const ids = out.map((i) => i.id);
      expect([...ids].sort((a, b) => a - b)).toEqual(ids);
      // Nada foi descartado sem motivo: se sobrou vaga, todo item fora bateu o teto.
      if (out.length < limit) {
        const kept = new Set(ids);
        for (const i of items) if (!kept.has(i.id)) expect(counts.get(i.sourceSlug)).toBe(max);
      }
    }
  });
});

describe("rankSources (tracking-plan §4)", () => {
  it("recomendadas: 1 descoberta a cada 5", () => {
    const r = rankSources(fixtureTen(), {
      list: "recommended",
      limit: 10,
      hidden: [],
      weights: REC_V1,
      personalization: true,
    });
    expect(r.slice(0, 5).filter((x) => x.discovery)).toHaveLength(1);
    expect(r.slice(5, 10).filter((x) => x.discovery)).toHaveLength(1);
    for (const d of r.filter((x) => x.discovery)) {
      expect(d.individual).toBe(0);
      expect(d.diversity).toBeGreaterThan(0);
    }
  });

  it("ocultadas, bloqueadas e excluídas não aparecem; fixadas vêm primeiro", () => {
    const r = rankSources(fixtureWithFlags(), {
      list: "popular",
      limit: 5,
      hidden: ["pv"],
      weights: REC_V1,
      personalization: false,
    });
    expect(r.map((x) => x.slug)).not.toContain("pv");
    expect(r.map((x) => x.slug)).not.toContain("bl");
    expect(r.map((x) => x.slug)).not.toContain("ex");
    expect(r[0]!.pinned).toBe(true);
  });

  it("mais acessadas ordena por popularidade", () => {
    const r = rankSources(fixtureTen(), {
      list: "popular",
      limit: 3,
      hidden: [],
      weights: REC_V1,
      personalization: false,
    });
    expect(r.map((x) => x.slug)).toEqual(["fc", "db", "ma"]);
  });

  it("em alta ordena por tendência e explica como em alta", () => {
    const list = [sig("a", { trend: 0.2 }), sig("b", { trend: 0.9 }), sig("c", { trend: 0.5 })];
    const r = rankSources(list, {
      list: "trending",
      limit: 3,
      hidden: [],
      weights: REC_V1,
      personalization: false,
    });
    expect(r.map((x) => x.slug)).toEqual(["b", "c", "a"]);
    expect(r.every((x) => x.reason === "trending")).toBe(true);
  });

  it("locais: só Cuiabá e Várzea Grande, destaque local logo após as fixadas", () => {
    const list = [
      sig("a", { locality: "cuiaba", popularity: 0.9 }),
      sig("b", { locality: "varzea-grande", popularity: 0.1, localHighlight: true }),
      sig("c", { locality: "mt", popularity: 1 }),
      sig("d", { locality: "cuiaba", popularity: 0.05, pinned: true }),
    ];
    const r = rankSources(list, {
      list: "local",
      limit: 5,
      hidden: [],
      weights: REC_V1,
      personalization: false,
    });
    expect(r.map((x) => x.slug)).toEqual(["d", "b", "a"]);
  });

  it("verificadas: só confiabilidade verificada ou primária", () => {
    const r = rankSources([sig("a", { verified: true }), sig("b")], {
      list: "verified",
      limit: 5,
      hidden: [],
      weights: REC_V1,
      personalization: false,
    });
    expect(r.map((x) => x.slug)).toEqual(["a"]);
  });

  it("seguidas: só as seguidas; recomendadas e novas não repetem as seguidas", () => {
    const list = [sig("a", { followed: true }), sig("b"), sig("c", { diversity: 0.5 })];
    const opts = { limit: 5, hidden: [], weights: REC_V1, personalization: true };
    expect(rankSources(list, { ...opts, list: "followed" }).map((x) => x.slug)).toEqual(["a"]);
    expect(rankSources(list, { ...opts, list: "followed" })[0]!.reason).toBe("followed");
    expect(rankSources(list, { ...opts, list: "recommended" }).map((x) => x.slug)).not.toContain(
      "a",
    );
    expect(rankSources(list, { ...opts, list: "new" }).map((x) => x.slug)).not.toContain("a");
  });

  it("personalização desligada: recomendadas viram populares da região, nunca vazias", () => {
    const r = rankSources(fixtureTen(), {
      list: "recommended",
      limit: 10,
      hidden: [],
      weights: REC_V1,
      personalization: false,
    });
    expect(r.length).toBeGreaterThan(0);
    for (const x of r) expect(x.reason).toBe(x.discovery ? "diversity" : "regional_popular");
  });

  it("critério de aceite 6: sem histórico, populares, locais, recomendadas e novas não ficam vazias", () => {
    const fresh = fixtureTen().map((s) => ({
      ...s,
      individual: 0,
      isNewForUser: true,
      recentVisit: false,
      matchesTopic: false,
      similar: false,
    }));
    for (const list of ["popular", "local", "recommended", "new", "trending"] as const)
      for (const personalization of [true, false])
        expect(
          rankSources(fresh, { list, limit: 8, hidden: [], weights: REC_V1, personalization })
            .length,
        ).toBeGreaterThan(0);
  });

  it("propriedade: nunca mostra excluída, bloqueada ou oculta; cada fonte no máximo 1 vez; teto e limite", () => {
    const r = rng(42);
    for (let round = 0; round < 200; round++) {
      const list = randomSignals(r, 3 + Math.floor(r() * 25));
      const hidden = list.filter(() => r() < 0.1).map((s) => s.slug);
      const limit = 1 + Math.floor(r() * 15);
      for (const name of LISTS) {
        const personalization = r() < 0.5;
        const out = rankSources(list, {
          list: name,
          limit,
          hidden,
          weights: REC_V1,
          personalization,
        });
        expect(out.length).toBeLessThanOrEqual(limit);
        const slugs = out.map((x) => x.slug);
        expect(new Set(slugs).size).toBe(slugs.length);
        for (const x of out) {
          expect(x.excluded).toBe(false);
          expect(x.blocked).toBe(false);
          expect(hidden).not.toContain(x.slug);
          expect(FIXED_TEXTS.has(explainRecommendation(x, {})) || x.reason === "topic").toBe(true);
          if (!personalization)
            expect([
              "recent_search",
              "topic",
              "local_follow",
              "recent_visit",
              "similar",
            ]).not.toContain(x.reason);
        }
        // Fixadas no topo.
        const firstUnpinned = out.findIndex((x) => !x.pinned);
        if (firstUnpinned >= 0 && name !== "recommended")
          expect(out.slice(firstUnpinned).some((x) => x.pinned)).toBe(false);
      }
    }
  });

  it("propriedade: em recomendadas, todo bloco completo de 5 tem exatamente 1 descoberta quando há candidatas", () => {
    const r = rng(1234);
    for (let round = 0; round < 300; round++) {
      const list = randomSignals(r, 5 + Math.floor(r() * 30)).map((s) => ({
        ...s,
        pinned: false,
      }));
      const personalization = r() < 0.7;
      const out = rankSources(list, {
        list: "recommended",
        limit: 5 + Math.floor(r() * 16),
        hidden: [],
        weights: REC_V1,
        personalization,
      });
      const eligible = (s: SourceSignals) =>
        !s.excluded && !s.blocked && !s.followed && s.diversity > 0 && s.individual === 0;
      let candidates = list.filter(eligible).length;
      for (let b = 0; b + 5 <= out.length; b += 5) {
        const block = out.slice(b, b + 5);
        const flagged = block.filter((x) => x.discovery);
        if (candidates > 0) expect(flagged).toHaveLength(1);
        else expect(flagged).toHaveLength(0);
        candidates -= block.filter(eligible).length;
        for (const d of flagged) expect(eligible(d)).toBe(true);
      }
    }
  });
});

describe("explainRecommendation (spec §7.4)", () => {
  it("justificativa nunca usa 'gosta'", () => {
    for (const x of rankSources(fixtureTen(), {
      list: "recommended",
      limit: 10,
      hidden: [],
      weights: REC_V1,
      personalization: true,
    }))
      expect(explainRecommendation(x, { topic: "política local" })).not.toMatch(/gost/i);
  });

  it("fonte seguida explica como seguida", () => {
    expect(explainRecommendation({ ...ranked("fc"), followed: true, reason: "followed" }, {})).toBe(
      "Veículo seguido por você",
    );
  });

  it("tema acompanhado usa o texto fixo com o tema", () => {
    expect(explainRecommendation(ranked("ma", { reason: "topic" }), { topic: "cultura" })).toBe(
      "Recomendado porque você acompanha cultura",
    );
  });

  it.each(["saúde", "religião", "orientação sexual", "raça", "renda", "partido político"])(
    "tema sensível (%s) nunca aparece na justificativa",
    (topic) => {
      const text = explainRecommendation(ranked("ma", { reason: "topic" }), { topic });
      expect(text).toBe("Fonte semelhante às que você lê");
    },
  );

  it("tema ausente cai para texto fixo sem tema", () => {
    expect(explainRecommendation(ranked("ma", { reason: "topic" }), {})).toBe(
      "Fonte semelhante às que você lê",
    );
  });

  it("personalizadas usam os textos fixos", () => {
    const r = rankSources(fixtureTen(), {
      list: "recommended",
      limit: 10,
      hidden: [],
      weights: REC_V1,
      personalization: true,
    });
    const by = new Map(r.map((x) => [x.slug, x.reason]));
    expect(by.get("ma")).toBe("topic");
    expect(by.get("cm")).toBe("recent_visit");
    expect(by.get("fc")).toBe("local_follow");
    expect(by.get("ag")).toBe("similar");
  });

  it("popular em Cuiabá para fonte local sem personalização", () => {
    const r = rankSources([sig("a", { locality: "cuiaba" })], {
      list: "popular",
      limit: 1,
      hidden: [],
      weights: REC_V1,
      personalization: false,
    });
    expect(explainRecommendation(r[0]!, {})).toBe("Popular em Cuiabá");
  });
});
