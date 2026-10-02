import { parseFeedDate } from "./parse-date";

describe("parseFeedDate", () => {
  it("data sem fuso é Cuiabá", () =>
    expect(parseFeedDate("2026-09-27 14:00")).toBe("2026-09-27T18:00:00.000Z"));
  it("RFC 822 com fuso", () =>
    expect(parseFeedDate("Sun, 27 Sep 2026 14:00:00 -0300")).toBe("2026-09-27T17:00:00.000Z"));
  it("RFC 822 com GMT e com zona nomeada", () => {
    expect(parseFeedDate("Sun, 27 Sep 2026 14:00:00 GMT")).toBe("2026-09-27T14:00:00.000Z");
    expect(parseFeedDate("Sun, 27 Sep 2026 14:00:00 EST")).toBe("2026-09-27T19:00:00.000Z");
  });
  it("RFC 822 sem fuso é Cuiabá", () =>
    expect(parseFeedDate("Sun, 27 Sep 2026 14:00:00")).toBe("2026-09-27T18:00:00.000Z"));
  it("RFC 822 em português", () =>
    expect(parseFeedDate("Dom, 27 Set 2026 07:00:00")).toBe("2026-09-27T11:00:00.000Z"));
  it("ISO 8601 com Z, com offset e sem fuso", () => {
    expect(parseFeedDate("2026-09-27T14:00:00Z")).toBe("2026-09-27T14:00:00.000Z");
    expect(parseFeedDate("2026-09-27T14:00:00-04:00")).toBe("2026-09-27T18:00:00.000Z");
    expect(parseFeedDate("2026-09-27T14:00:00.250+0000")).toBe("2026-09-27T14:00:00.250Z");
    expect(parseFeedDate("2026-09-27T09:30:00")).toBe("2026-09-27T13:30:00.000Z");
  });
  it("só a data: meia-noite em Cuiabá", () =>
    expect(parseFeedDate("2026-09-26")).toBe("2026-09-26T04:00:00.000Z"));
  it("formato brasileiro dd/mm/aaaa", () =>
    expect(parseFeedDate("27/09/2026 08:15")).toBe("2026-09-27T12:15:00.000Z"));
  it("Cuiabá teve horário de verão até 2019", () =>
    expect(parseFeedDate("2018-12-01 12:00")).toBe("2018-12-01T15:00:00.000Z"));
  it("inválida ou impossível vira null", () => {
    expect(parseFeedDate("")).toBeNull();
    expect(parseFeedDate("ontem à tarde")).toBeNull();
    expect(parseFeedDate("2026-02-30 10:00")).toBeNull();
    expect(parseFeedDate("2026-09-27 25:00")).toBeNull();
  });
});
