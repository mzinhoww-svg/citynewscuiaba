import { parseDateInText, parseFeedDate } from "./parse-date";

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

describe("parseFeedDate: português e separadores de sites públicos", () => {
  it("data por extenso", () => {
    expect(parseFeedDate("03 de Outubro de 2026")).toBe("2026-10-03T04:00:00.000Z");
    expect(parseFeedDate("3 DE OUTUBRO DE 2026 ÀS 06:30:00")).toBe("2026-10-03T10:30:00.000Z");
    expect(parseFeedDate("1 de março de 2026")).toBe("2026-03-01T04:00:00.000Z");
  });
  it("dd/mm/aaaa com | ou h", () => {
    expect(parseFeedDate("29/09/2026 | 13:53")).toBe("2026-09-29T17:53:00.000Z");
    expect(parseFeedDate("02/10/2026 13h47")).toBe("2026-10-02T17:47:00.000Z");
  });
  it("mês desconhecido ou dia impossível vira null", () => {
    expect(parseFeedDate("3 de foo de 2026")).toBeNull();
    expect(parseFeedDate("31 de fevereiro de 2026")).toBeNull();
  });
});

describe("parseDateInText", () => {
  it("acha a data no meio de ruído", () => {
    expect(parseDateInText("Postado em 02/10/2026 13h47 · 1 day ago")).toBe(
      "2026-10-02T17:47:00.000Z",
    );
    expect(parseDateInText("Publicado: 3 de outubro de 2026 - atualizado")).toBe(
      "2026-10-03T04:00:00.000Z",
    );
  });
  it("sem data devolve null", () => expect(parseDateInText("Há 3 horas")).toBeNull());
});
