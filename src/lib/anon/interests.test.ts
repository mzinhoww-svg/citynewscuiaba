import { describe, expect, it } from "vitest";
import { deriveInterests } from "./interests";

const NOW = new Date("2026-09-27T12:00:00Z");
const day = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();
const read = (section: string, d: number, seconds = 45, scrollPct = 80) => ({
  ref: `article:${section}-${d}`,
  section,
  at: day(d),
  seconds,
  scrollPct,
});

describe("interesses a partir do histórico local (P21)", () => {
  it("leituras qualificadas em 3 dias diferentes viram interesse; menos que isso é sinal fraco", () => {
    const out = deriveInterests(
      [read("cidade", 1), read("cidade", 2), read("cidade", 3), read("cultura", 1)],
      { cidade: "Cidade", cultura: "Cultura" },
    );
    expect(out).toEqual([
      {
        key: "Cidade",
        section: "cidade",
        evidence: "3 leituras em Cidade nos últimos 30 dias",
        weak: false,
      },
      {
        key: "Cultura",
        section: "cultura",
        evidence: "1 leitura em Cultura nos últimos 30 dias",
        weak: true,
      },
    ]);
  });

  it("leitura rápida não conta e editoria desconhecida usa o próprio nome", () => {
    const out = deriveInterests([read("cidade", 1, 5, 10), read("tecnologia", 1)], {});
    expect(out.map((i) => i.key)).toEqual(["tecnologia"]);
  });
});
