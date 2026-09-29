import { effectiveFrequency, isDue, laneOf, nextCollectionAt, suggestFrequency } from "./frequency";
import { defaultFrequencySchema, frequencySchema } from "./schema";

const NOW = new Date("2026-09-27T14:00:00Z");
const every = (minutes: number, n: number): string[] =>
  Array.from({ length: n }, (_, i) => new Date(NOW.getTime() - i * minutes * 60_000).toISOString());

describe("frequência", () => {
  it("grade: 10, 15, 20 e de 30 em 30 até 24 h", () => {
    for (const v of [0, 5, 25, 45, 1470, 31, -30, 1.5])
      expect(frequencySchema.safeParse(v).success).toBe(false);
    for (const v of [10, 15, 20, 30, 120, 1440, null])
      expect(frequencySchema.safeParse(v).success).toBe(true);
    for (const v of [10, 20, 15, 25, 1470])
      expect(defaultFrequencySchema.safeParse(v).success).toBe(false);
    expect(defaultFrequencySchema.safeParse(null).success).toBe(false);
    expect(defaultFrequencySchema.safeParse(30).success).toBe(true);
  });

  it("via rápida: próximas coletas na grade", () => {
    const next = (last: string, f: number) =>
      nextCollectionAt(
        { status: "active", lastFetchedAt: last, frequencyMinutes: f },
        new Date(last),
      )?.toISOString();
    expect(next("2026-09-27T14:03:00Z", 10)).toBe("2026-09-27T14:10:00.000Z");
    expect(next("2026-09-27T14:02:00Z", 15)).toBe("2026-09-27T14:20:00.000Z");
    expect(next("2026-09-27T14:21:00Z", 15)).toBe("2026-09-27T14:30:00.000Z");
    expect(next("2026-09-27T14:01:00Z", 20)).toBe("2026-09-27T14:20:00.000Z");
    expect(
      isDue(
        { lastFetchedAt: "2026-09-27T14:02:00Z", frequencyMinutes: 15 },
        new Date("2026-09-27T14:10:05Z"),
      ),
    ).toBe(false);
    expect(
      isDue(
        { lastFetchedAt: "2026-09-27T14:02:00Z", frequencyMinutes: 15 },
        new Date("2026-09-27T14:20:05Z"),
      ),
    ).toBe(true);
  });

  it("Crawl-delay e termos elevam a frequência efetiva e podem tirar da via rápida", () => {
    expect(
      effectiveFrequency(10, 30, { crawlDelaySec: 900, termsMinIntervalMinutes: null }),
    ).toEqual({ minutes: 30, raisedBy: "robots" });
    expect(
      effectiveFrequency(10, 30, { crawlDelaySec: null, termsMinIntervalMinutes: 12 }),
    ).toEqual({ minutes: 15, raisedBy: "terms" });
    expect(effectiveFrequency(10, 30)).toEqual({ minutes: 10, raisedBy: null });
    expect(laneOf(effectiveFrequency(10, 30).minutes)).toBe("fast");
    expect(laneOf(effectiveFrequency(null, 30).minutes)).toBe("normal");
    expect(effectiveFrequency(30, 30, { crawlDelaySec: 60, termsMinIntervalMinutes: 25 })).toEqual({
      minutes: 30,
      raisedBy: null,
    });
    expect(
      effectiveFrequency(30, 30, { crawlDelaySec: null, termsMinIntervalMinutes: 40 }).minutes,
    ).toBe(60);
    expect(
      effectiveFrequency(1440, 30, { crawlDelaySec: null, termsMinIntervalMinutes: 5000 }).minutes,
    ).toBe(1440);
  });

  it("30 min coletada às 14:07 vence no tick de 14:30", () => {
    expect(
      isDue(
        { lastFetchedAt: "2026-09-27T14:07:00Z", frequencyMinutes: 30 },
        new Date("2026-09-27T14:30:04Z"),
      ),
    ).toBe(true);
    expect(
      isDue(
        { lastFetchedAt: "2026-09-27T14:07:00Z", frequencyMinutes: 30 },
        new Date("2026-09-27T14:20:00Z"),
      ),
    ).toBe(false);
  });

  it("nunca coletada vence", () =>
    expect(isDue({ lastFetchedAt: null, frequencyMinutes: 30 }, NOW)).toBe(true));

  it("2 h coletada às 14:05: próxima 16:00", () =>
    expect(
      nextCollectionAt(
        { status: "active", lastFetchedAt: "2026-09-27T14:05:00Z", frequencyMinutes: 120 },
        new Date("2026-09-27T14:10:00Z"),
      )?.toISOString(),
    ).toBe("2026-09-27T16:00:00.000Z"));

  it("nunca coletada: próxima janela", () => {
    expect(
      nextCollectionAt(
        { status: "active", lastFetchedAt: null, frequencyMinutes: 30 },
        new Date("2026-09-27T14:10:00Z"),
      )?.toISOString(),
    ).toBe("2026-09-27T14:30:00.000Z");
    expect(
      nextCollectionAt(
        { status: "degraded", lastFetchedAt: null, frequencyMinutes: 10 },
        new Date("2026-09-27T14:12:00Z"),
      )?.toISOString(),
    ).toBe("2026-09-27T14:20:00.000Z");
  });

  it("atrasada aponta a próxima janela, nunca o passado", () =>
    expect(
      nextCollectionAt(
        { status: "active", lastFetchedAt: "2026-09-27T10:00:00Z", frequencyMinutes: 30 },
        new Date("2026-09-27T14:10:00Z"),
      )?.toISOString(),
    ).toBe("2026-09-27T14:30:00.000Z"));

  it("pausada, bloqueada não têm próxima coleta", () => {
    expect(
      nextCollectionAt({ status: "paused", lastFetchedAt: null, frequencyMinutes: 30 }, NOW),
    ).toBeNull();
    expect(
      nextCollectionAt({ status: "blocked", lastFetchedAt: null, frequencyMinutes: 30 }, NOW),
    ).toBeNull();
  });

  it("null segue o padrão", () => expect(effectiveFrequency(null, 60).minutes).toBe(60));

  it("cadência: 48 itens em 24 h → 30 min; gap de 6 h → 180; 2 datas → padrão", () => {
    expect(suggestFrequency(every(30, 48), NOW).minutes).toBe(30);
    expect(suggestFrequency(every(360, 5), NOW).minutes).toBe(180);
    expect(suggestFrequency(every(60, 2), NOW).basis).toBe("default");
    expect(suggestFrequency(every(30, 48), NOW).basis).toBe("cadence");
    expect(suggestFrequency(every(3000, 3), NOW).minutes).toBe(1440);
    expect(suggestFrequency(every(5, 40), NOW).minutes).toBe(30);
  });

  it("ignora datas com mais de 7 dias", () => {
    const old = [0, 1, 2].map((i) => new Date(NOW.getTime() - (10 + i) * 86_400_000).toISOString());
    expect(suggestFrequency(old, NOW).basis).toBe("default");
  });
});
