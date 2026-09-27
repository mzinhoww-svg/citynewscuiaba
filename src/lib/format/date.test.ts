import { formatDayMonth, formatHour, formatWhen, nextCycleMinutes } from "./date";

const now = new Date("2026-09-27T18:00:00Z"); // 14h em Cuiabá (UTC−4)

describe("formatWhen", () => {
  it("relativo até 24 h", () => expect(formatWhen("2026-09-27T17:48:00Z", now)).toBe("há 12 min"));
  it("absoluto após 24 h, no fuso de Cuiabá", () =>
    expect(formatWhen("2026-09-25T13:12:00Z", now)).toBe("25/09/2026, 9h12"));
  it("menos de 1 min vira agora", () =>
    expect(formatWhen("2026-09-27T17:59:40Z", now)).toBe("agora"));
  it("horas cheias até 24 h", () => expect(formatWhen("2026-09-27T15:00:00Z", now)).toBe("há 3 h"));
  it("hora cheia sem minutos no absoluto", () =>
    expect(formatWhen("2026-09-20T23:00:00Z", now)).toBe("20/09/2026, 19h"));
  it("data futura ou inválida não vira relativo", () => {
    expect(formatWhen("2026-10-03T22:00:00Z", now)).toBe("03/10/2026, 18h");
    expect(formatWhen("nao-e-data", now)).toBe("");
  });
});

describe("auxiliares de agenda e ciclo", () => {
  it("hora no formato da marca", () => {
    expect(formatHour("2026-10-09T23:00:00Z")).toBe("19h");
    expect(formatHour("2026-10-10T00:30:00Z")).toBe("20h30");
  });
  it("dia e mês curtos em Cuiabá", () =>
    expect(formatDayMonth("2026-10-04T10:30:00Z")).toBe("4 out"));
  it("próximo ciclo de 30 min", () => {
    expect(nextCycleMinutes(new Date("2026-09-27T18:12:00Z"))).toBe(18);
    expect(nextCycleMinutes(new Date("2026-09-27T18:30:00Z"))).toBe(30);
  });
});
