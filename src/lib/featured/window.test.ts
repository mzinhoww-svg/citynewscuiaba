import { describe, expect, it } from "vitest";
import { windowEnd, windowStart } from "./window";

const at = (local: string) => new Date(`${local}-04:00`); // America/Cuiaba = UTC-4

describe("windowStart (America/Cuiaba)", () => {
  it("janela de 1 h (padrão, R28): arredonda para a hora cheia", () => {
    expect(windowStart(at("2026-10-03T14:10:00"))).toEqual(at("2026-10-03T14:00:00"));
    expect(windowStart(at("2026-10-03T14:00:00"))).toEqual(at("2026-10-03T14:00:00"));
    expect(windowStart(at("2026-10-03T23:59:59"))).toEqual(at("2026-10-03T23:00:00"));
  });

  it("janela de 3 h: 00:00, 02:59, 03:00, 14:10 e 23:59", () => {
    expect(windowStart(at("2026-10-03T00:00:00"), 3)).toEqual(at("2026-10-03T00:00:00"));
    expect(windowStart(at("2026-10-03T02:59:59"), 3)).toEqual(at("2026-10-03T00:00:00"));
    expect(windowStart(at("2026-10-03T03:00:00"), 3)).toEqual(at("2026-10-03T03:00:00"));
    expect(windowStart(at("2026-10-03T14:10:00"), 3)).toEqual(at("2026-10-03T12:00:00"));
    expect(windowStart(at("2026-10-03T23:59:59"), 3)).toEqual(at("2026-10-03T21:00:00"));
  });

  it("virada de dia: 00:00 local de 04/10 abre uma janela nova no dia 04", () => {
    expect(windowStart(at("2026-10-04T00:00:00"), 3)).toEqual(at("2026-10-04T00:00:00"));
    expect(windowStart(at("2026-10-03T23:59:59.999"), 3)).toEqual(at("2026-10-03T21:00:00"));
  });

  it("usa o fuso de Cuiabá, não o UTC: 03:30Z (23:30 do dia anterior) cai em 21h", () => {
    expect(windowStart(new Date("2026-10-04T03:30:00Z"), 3)).toEqual(at("2026-10-03T21:00:00"));
  });

  it("windowEnd é o início mais a duração", () => {
    expect(windowEnd(at("2026-10-03T14:10:00"), 1)).toEqual(at("2026-10-03T15:00:00"));
    expect(windowEnd(at("2026-10-03T14:10:00"), 3)).toEqual(at("2026-10-03T15:00:00"));
    expect(windowEnd(at("2026-10-03T10:10:00"), 3)).toEqual(at("2026-10-03T12:00:00"));
  });
});
