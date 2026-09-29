import { fastWindowStart, windowStart } from "./window";

describe("janela de 30 min", () => {
  it("arredonda para :30", () => {
    expect(windowStart(new Date("2026-09-27T14:44:10Z")).toISOString()).toBe(
      "2026-09-27T14:30:00.000Z",
    );
  });
  it("arredonda para :00", () => {
    expect(windowStart(new Date("2026-09-27T14:29:59.999Z")).toISOString()).toBe(
      "2026-09-27T14:00:00.000Z",
    );
  });
  it("início exato da janela fica nela", () => {
    expect(windowStart(new Date("2026-09-27T14:30:00Z")).toISOString()).toBe(
      "2026-09-27T14:30:00.000Z",
    );
  });
});

describe("janela de 10 min (via rápida)", () => {
  it("arredonda para o múltiplo de 10 anterior", () => {
    expect(fastWindowStart(new Date("2026-09-27T14:03:00Z")).toISOString()).toBe(
      "2026-09-27T14:00:00.000Z",
    );
    expect(fastWindowStart(new Date("2026-09-27T14:21:00Z")).toISOString()).toBe(
      "2026-09-27T14:20:00.000Z",
    );
  });
  it("início exato da janela fica nela", () => {
    expect(fastWindowStart(new Date("2026-09-27T14:10:00Z")).toISOString()).toBe(
      "2026-09-27T14:10:00.000Z",
    );
  });
});
