import { describe, expect, it } from "vitest";
import { detectHot, supportScore, type FrontSignal } from "./hot";

const now = new Date("2026-10-04T15:00:00-04:00");
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000);

const sig = (sourceId: string, rank: number, ago = 1, topicId = "t1"): FrontSignal => ({
  sourceId,
  topicId,
  rank,
  seenAt: hoursAgo(ago),
});

describe("detectHot (pauta quente, R8 a R11)", () => {
  it("3 fontes distintas no rank 1 a 3 dentro de 6 h: quente", () => {
    const hot = detectHot([sig("a", 1, 1), sig("b", 2, 2), sig("c", 3, 5.5)], now);
    expect(hot).toEqual([{ topicId: "t1", sources: 3, lastSeenAt: hoursAgo(1) }]);
  });

  it("2 fontes não bastam", () => {
    expect(detectHot([sig("a", 1), sig("b", 1)], now)).toEqual([]);
  });

  it("a mesma fonte repetida conta 1", () => {
    expect(detectHot([sig("a", 1), sig("a", 2), sig("a", 3), sig("b", 1)], now)).toEqual([]);
    const hot = detectHot([sig("a", 1), sig("a", 2), sig("b", 1), sig("c", 1)], now);
    expect(hot[0]?.sources).toBe(3);
  });

  it("rank 4 não conta", () => {
    expect(detectHot([sig("a", 1), sig("b", 2), sig("c", 4)], now)).toEqual([]);
  });

  it("sinal de 7 h atrás não conta", () => {
    expect(detectHot([sig("a", 1), sig("b", 2), sig("c", 1, 7)], now)).toEqual([]);
  });

  it("minSources = 4 exige 4 fontes", () => {
    const three = [sig("a", 1), sig("b", 2), sig("c", 3)];
    expect(detectHot(three, now, { minSources: 4 })).toEqual([]);
    expect(detectHot([...three, sig("d", 1)], now, { minSources: 4 })).toHaveLength(1);
  });

  it("windowHours e maxRank configuráveis", () => {
    const s = [sig("a", 1, 7), sig("b", 4), sig("c", 5)];
    expect(detectHot(s, now)).toEqual([]);
    expect(detectHot(s, now, { windowHours: 8, maxRank: 5 })).toHaveLength(1);
  });

  it("sinal sem assunto (URL sem item coletado) e sinal no futuro não contam", () => {
    const future = { ...sig("c", 1), seenAt: new Date(now.getTime() + 60_000) };
    expect(detectHot([sig("a", 1), sig("b", 1), sig("c", 1, 1, "")], now)).toEqual([]);
    expect(detectHot([sig("a", 1), sig("b", 1), future], now)).toEqual([]);
  });

  it("ordena por fontes desc e, no empate, pelo sinal mais recente", () => {
    const signals = [
      ...["a", "b", "c"].map((s) => sig(s, 1, 3, "velho")),
      ...["a", "b", "c"].map((s) => sig(s, 1, 0.5, "novo")),
      ...["a", "b", "c", "d"].map((s) => sig(s, 2, 4, "maior")),
    ];
    expect(detectHot(signals, now).map((h) => h.topicId)).toEqual(["maior", "novo", "velho"]);
  });
});

describe("supportScore (apoio por cobertura simultânea)", () => {
  it("só pontua cobertura com 3 fontes ou mais, entre 0 e 1", () => {
    const score = supportScore(
      [
        { topicId: "dois", sources: 2 },
        { topicId: "tres", sources: 3 },
        { topicId: "muitos", sources: 12 },
      ],
      now,
    );
    expect(score.has("dois")).toBe(false);
    expect(score.get("tres")).toBeGreaterThan(0);
    expect(score.get("muitos")).toBeLessThanOrEqual(1);
    expect(score.get("muitos")!).toBeGreaterThan(score.get("tres")!);
  });

  it("nunca devolve HotTopic: os valores são números, não assuntos quentes", () => {
    const score = supportScore([{ topicId: "t1", sources: 9 }], now);
    for (const v of score.values()) {
      expect(typeof v).toBe("number");
      expect(v).not.toHaveProperty("sources");
    }
  });
});
