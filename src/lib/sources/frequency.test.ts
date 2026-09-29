import { defaultFrequencySchema, frequencySchema } from "./schema";
import { effectiveFrequency, isDue, laneOf, nextCollectionAt, suggestFrequency } from "./frequency";

const NOW = new Date("2026-09-27T18:00:00Z");

/** `count` datas ISO espaçadas de `gapMinutes`, terminando em `NOW`. */
function every(gapMinutes: number, count: number): string[] {
  return Array.from({ length: count }, (_, i) =>
    new Date(NOW.getTime() - i * gapMinutes * 60_000).toISOString(),
  );
}

describe("frequencySchema", () => {
  it("grade: 10, 15, 20 e de 30 em 30 até 24 h", () => {
    for (const v of [0, 5, 25, 45, 1470]) expect(frequencySchema.safeParse(v).success).toBe(false);
    for (const v of [10, 15, 20, 30, 120, 1440, null])
      expect(frequencySchema.safeParse(v).success).toBe(true);
    for (const v of [10, 20, null]) expect(defaultFrequencySchema.safeParse(v).success).toBe(false);
  });
});

describe("via rápida", () => {
  const next = (last: string, f: number) =>
    nextCollectionAt(
      { status: "active", lastFetchedAt: last, frequencyMinutes: f },
      new Date(last),
    )?.toISOString();

  it("10 min coletada às 14:03 → 14:10", () => {
    expect(next("2026-09-27T14:03:00Z", 10)).toBe("2026-09-27T14:10:00.000Z");
  });
  it("15 min às 14:02 → 14:20 e às 14:21 → 14:30", () => {
    expect(next("2026-09-27T14:02:00Z", 15)).toBe("2026-09-27T14:20:00.000Z");
    expect(next("2026-09-27T14:21:00Z", 15)).toBe("2026-09-27T14:30:00.000Z");
  });
  it("20 min às 14:01 → 14:20", () => {
    expect(next("2026-09-27T14:01:00Z", 20)).toBe("2026-09-27T14:20:00.000Z");
  });
  it("15 min coletada às 14:02: às 14:10 ainda não venceu", () => {
    expect(
      isDue(
        { lastFetchedAt: "2026-09-27T14:02:00Z", frequencyMinutes: 15 },
        new Date("2026-09-27T14:10:05Z"),
      ),
    ).toBe(false);
  });
});

describe("Crawl-delay e termos elevam a frequência efetiva", () => {
  it("robots.txt eleva e pode tirar da via rápida", () => {
    expect(
      effectiveFrequency(10, 30, { crawlDelaySec: 900, termsMinIntervalMinutes: null }),
    ).toEqual({
      minutes: 30,
      raisedBy: "robots",
    });
  });
  it("termos elevam para a próxima grade", () => {
    expect(
      effectiveFrequency(10, 30, { crawlDelaySec: null, termsMinIntervalMinutes: 12 }),
    ).toEqual({
      minutes: 15,
      raisedBy: "terms",
    });
  });
  it("laneOf classifica pela frequência efetiva", () => {
    expect(laneOf(effectiveFrequency(10, 30).minutes)).toBe("fast");
    expect(laneOf(effectiveFrequency(null, 30).minutes)).toBe("normal");
  });
  it("null segue o padrão", () => {
    expect(effectiveFrequency(null, 60).minutes).toBe(60);
  });
});

describe("ciclo normal", () => {
  it("30 min coletada às 14:07 vence no tick de 14:30", () => {
    expect(
      isDue(
        { lastFetchedAt: "2026-09-27T14:07:00Z", frequencyMinutes: 30 },
        new Date("2026-09-27T14:30:04Z"),
      ),
    ).toBe(true);
  });
  it("2 h coletada às 14:05: próxima 16:00", () => {
    expect(
      nextCollectionAt(
        { status: "active", lastFetchedAt: "2026-09-27T14:05:00Z", frequencyMinutes: 120 },
        new Date("2026-09-27T14:10:00Z"),
      )?.toISOString(),
    ).toBe("2026-09-27T16:00:00.000Z");
  });
  it("nunca coletada: próxima janela", () => {
    expect(
      nextCollectionAt(
        { status: "active", lastFetchedAt: null, frequencyMinutes: 30 },
        new Date("2026-09-27T14:10:00Z"),
      )?.toISOString(),
    ).toBe("2026-09-27T14:30:00.000Z");
  });
  it("pausada não tem próxima coleta", () => {
    expect(
      nextCollectionAt({ status: "paused", lastFetchedAt: null, frequencyMinutes: 30 }, new Date()),
    ).toBeNull();
  });
});

describe("suggestFrequency", () => {
  it("48 itens em 24 h → 30 min", () => {
    expect(suggestFrequency(every(30, 48), NOW).minutes).toBe(30);
  });
  it("gap de 6 h → 180", () => {
    expect(suggestFrequency(every(360, 5), NOW).minutes).toBe(180);
  });
  it("2 datas → padrão", () => {
    expect(suggestFrequency(every(60, 2), NOW).basis).toBe("default");
  });
});
