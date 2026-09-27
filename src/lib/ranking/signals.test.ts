import { describe, expect, it } from "vitest";
import {
  computeSignals,
  decayWeight,
  formatReach,
  operationalScore,
  percentiles,
  type ReaderEvent,
  type SourceRawInput,
} from "./signals";

const NOW = new Date("2026-09-27T18:00:00Z"); // 14h em Cuiabá

function day(daysAgo: number): string {
  const d = new Date(Date.UTC(2026, 8, 27 - daysAgo));
  return d.toISOString().slice(0, 10);
}

function raw(slug: string, over: Partial<SourceRawInput> = {}): SourceRawInput {
  return {
    slug,
    locality: "cuiaba",
    categories: ["cidade"],
    reliability: "standard",
    status: "active",
    pinned: false,
    excluded: false,
    localHighlight: false,
    days: [],
    items24h: 0,
    lastItemAt: null,
    fetch: { ok: 0, total: 0, consecutiveFailures: 0 },
    ...over,
  };
}

function flat(sessions: number, from = 1, to = 14) {
  return [...Array(to - from + 1)].map((_, i) => ({
    day: day(from + i),
    sessions,
    clicks: sessions,
    saves: 0,
    shares: 0,
    returns: 0,
  }));
}

describe("percentiles", () => {
  it("zero fica 0; maior fica 1; empates dividem a posição", () => {
    expect(percentiles([0, 10, 20, 30])).toEqual([0, 1 / 3, 2 / 3, 1]);
    expect(percentiles([5, 5])).toEqual([0.5, 0.5]);
    expect(percentiles([7])).toEqual([1]);
    expect(percentiles([0, 0])).toEqual([0, 0]);
  });
});

describe("meia-vida de 3 dias", () => {
  it("ontem vale 1, 4 dias atrás vale 0,5", () => {
    expect(decayWeight(1)).toBeCloseTo(1, 10);
    expect(decayWeight(4)).toBeCloseTo(0.5, 10);
    expect(decayWeight(7)).toBeCloseTo(0.25, 10);
  });
});

describe("qualidade operacional", () => {
  it("3 falhas seguidas → no máximo 0,2", () => {
    expect(
      operationalScore({ ok: 27, total: 30, consecutiveFailures: 3 }, "active"),
    ).toBeLessThanOrEqual(0.2);
  });
  it("disponibilidade alta sem falha recente fica alta; sem histórico é neutra", () => {
    expect(operationalScore({ ok: 29, total: 30, consecutiveFailures: 0 }, "active")).toBeCloseTo(
      29 / 30,
      5,
    );
    expect(operationalScore({ ok: 0, total: 0, consecutiveFailures: 0 }, "active")).toBe(1);
  });
  it("fonte degradada nunca passa de 0,5", () => {
    expect(operationalScore({ ok: 30, total: 30, consecutiveFailures: 0 }, "degraded")).toBe(0.5);
  });
});

describe("alcance aproximado", () => {
  it.each([
    [18_342, "~18 mil"],
    [1_499, "~1 mil"],
    [940, "~900"],
    [42, "menos de 100"],
    [2_340_000, "~2,3 mi"],
  ])("%d → %s", (n, text) => expect(formatReach(n)).toBe(text));
});

describe("computeSignals", () => {
  const base = [
    raw("grande", { days: flat(600), items24h: 30, lastItemAt: "2026-09-27T17:48:00Z" }),
    raw("media", { days: flat(200), items24h: 10, lastItemAt: "2026-09-27T12:00:00Z" }),
    raw("pequena", { days: flat(50), locality: "mt", categories: ["cultura"] }),
    raw("sumida", { days: [], categories: ["esportes"] }),
  ];

  it("componentes em [0, 1] e popularidade por percentil", () => {
    const s = computeSignals(base, { window: "7d", now: NOW });
    for (const x of s)
      for (const k of [
        "popularity",
        "individual",
        "recency",
        "engagement",
        "operational",
        "diversity",
        "trend",
      ] as const) {
        expect(x[k]).toBeGreaterThanOrEqual(0);
        expect(x[k]).toBeLessThanOrEqual(1);
      }
    const by = new Map(s.map((x) => [x.slug, x]));
    expect(by.get("grande")!.popularity).toBe(1);
    expect(by.get("sumida")!.popularity).toBe(0);
    expect(by.get("grande")!.popularity).toBeGreaterThan(by.get("media")!.popularity);
  });

  it("sem leitor, individual = 0 e toda fonte é nova para ele", () => {
    const s = computeSignals(base, { window: "7d", now: NOW });
    expect(s.every((x) => x.individual === 0 && x.isNewForUser)).toBe(true);
    // Diversidade sem leitor: bônus para as menos acessadas.
    const by = new Map(s.map((x) => [x.slug, x]));
    expect(by.get("pequena")!.diversity).toBeGreaterThan(by.get("grande")!.diversity);
  });

  it("janela 7d com meia-vida: queda recente pesa mais que o total antigo", () => {
    const caindo = raw("caindo", {
      days: [...flat(0, 1, 3), ...flat(1000, 4, 7)],
    });
    const subindo = raw("subindo", {
      days: [...flat(700, 1, 3), ...flat(0, 4, 7)],
    });
    const s = computeSignals([caindo, subindo], { window: "7d", now: NOW });
    const by = new Map(s.map((x) => [x.slug, x]));
    expect(by.get("subindo")!.popularity).toBeGreaterThan(by.get("caindo")!.popularity);
    expect(by.get("subindo")!.trendDirection).toBe("up");
    expect(by.get("caindo")!.trendDirection).toBe("down");
    expect(by.get("subindo")!.trend).toBeGreaterThan(by.get("caindo")!.trend);
  });

  it("janela 1d usa só o último dia completo", () => {
    const a = raw("a", { days: [...flat(10, 1, 1), ...flat(900, 2, 7)] });
    const b = raw("b", { days: [...flat(100, 1, 1)] });
    const s = computeSignals([a, b], { window: "1d", now: NOW });
    const by = new Map(s.map((x) => [x.slug, x]));
    expect(by.get("b")!.popularity).toBeGreaterThan(by.get("a")!.popularity);
  });

  it("tendência estável quando o volume não muda; alcance soma 30 dias", () => {
    const s = computeSignals([raw("x", { days: flat(100, 1, 30) })], { window: "7d", now: NOW });
    expect(s[0]!.trendDirection).toBe("stable");
    expect(s[0]!.reach).toBe(3000);
  });

  it("flags do admin e confiabilidade passam para os sinais", () => {
    const s = computeSignals(
      [
        raw("p", { pinned: true, reliability: "verified", localHighlight: true }),
        raw("e", { excluded: true, reliability: "primary" }),
        raw("l", { reliability: "low" }),
      ],
      { window: "7d", now: NOW },
    );
    const by = new Map(s.map((x) => [x.slug, x]));
    expect(by.get("p")).toMatchObject({ pinned: true, verified: true, localHighlight: true });
    expect(by.get("e")).toMatchObject({ excluded: true, verified: true });
    expect(by.get("l")).toMatchObject({ verified: false, blocked: false });
  });

  describe("com leitor (Personalização)", () => {
    const ev = (name: ReaderEvent["name"], source: string, at: string): ReaderEvent => ({
      name,
      sourceSlug: source,
      at,
      seconds: name === "article_read" ? 45 : undefined,
      scrollPct: name === "article_read" ? 70 : undefined,
    });

    it("leitura qualificada e seguir contam; clique isolado (sinal fraco) não conta", () => {
      const reader = [
        ev("article_read", "media", "2026-09-26T12:00:00Z"),
        ev("source_followed", "media", "2026-09-26T12:00:00Z"),
        ev("article_opened", "pequena", "2026-09-26T12:00:00Z"),
      ];
      const s = computeSignals(base, { window: "7d", now: NOW, reader });
      const by = new Map(s.map((x) => [x.slug, x]));
      expect(by.get("media")!.individual).toBeGreaterThan(0);
      expect(by.get("media")!.isNewForUser).toBe(false);
      expect(by.get("media")!.recentVisit).toBe(true);
      expect(by.get("pequena")!.individual).toBe(0);
      expect(by.get("grande")!.individual).toBe(0);
      // Lida pelo leitor não é descoberta; fonte da mesma editoria que ele não lê é "semelhante".
      expect(by.get("media")!.diversity).toBe(0);
      expect(by.get("grande")!.similar).toBe(true);
      expect(by.get("pequena")!.similar).toBe(false);
      expect(by.get("pequena")!.diversity).toBeGreaterThan(by.get("grande")!.diversity);
    });

    it("cliques fracos repetidos em 3 dias diferentes passam a contar", () => {
      const reader = [
        ev("article_opened", "pequena", "2026-09-24T12:00:00Z"),
        ev("article_opened", "pequena", "2026-09-25T12:00:00Z"),
        ev("article_opened", "pequena", "2026-09-26T12:00:00Z"),
      ];
      const s = computeSignals(base, { window: "7d", now: NOW, reader });
      expect(s.find((x) => x.slug === "pequena")!.individual).toBeGreaterThan(0);
    });

    it("leitura curta (< 10 s ou rolagem < 25%) é sinal fraco", () => {
      const reader: ReaderEvent[] = [
        {
          name: "article_read",
          sourceSlug: "media",
          at: "2026-09-26T12:00:00Z",
          seconds: 8,
          scrollPct: 90,
        },
      ];
      const s = computeSignals(base, { window: "7d", now: NOW, reader });
      expect(s.find((x) => x.slug === "media")!.individual).toBe(0);
    });

    it("eventos de fonte desconhecida ou antigos (> 30 dias) são ignorados", () => {
      const reader = [
        ev("article_read", "nao-existe", "2026-09-26T12:00:00Z"),
        ev("article_read", "media", "2026-08-01T12:00:00Z"),
      ];
      const s = computeSignals(base, { window: "7d", now: NOW, reader });
      expect(s.every((x) => x.individual === 0)).toBe(true);
    });
  });
});
