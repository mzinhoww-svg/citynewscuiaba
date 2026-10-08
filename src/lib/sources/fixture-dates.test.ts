import { describe, expect, it } from "vitest";
import { fixtureShiftDays, shiftFixtureDates } from "./fixture-dates";

describe("fixtureShiftDays", () => {
  it("zero até a semana-âncora; depois, semanas inteiras arredondadas para cima", () => {
    expect(fixtureShiftDays(new Date("2026-10-01T12:00:00Z"))).toBe(0);
    expect(fixtureShiftDays(new Date("2026-10-08T15:00:00Z"))).toBe(0);
    expect(fixtureShiftDays(new Date("2026-10-09T15:00:00Z"))).toBe(7);
    expect(fixtureShiftDays(new Date("2026-10-15T15:00:00Z"))).toBe(7);
    expect(fixtureShiftDays(new Date("2026-10-16T15:00:00Z"))).toBe(14);
    expect(fixtureShiftDays(new Date("2027-03-01T15:00:00Z")) % 7).toBe(0);
  });
});

describe("shiftFixtureDates", () => {
  it("sem deslocamento devolve o texto igual", () => {
    expect(shiftFixtureDates("sábado, 24 de outubro de 2026", 0)).toBe(
      "sábado, 24 de outubro de 2026",
    );
  });

  it("desloca todos os formatos das fixtures da Agenda e mantém o dia da semana", () => {
    const text = [
      '"startDate": "2026-10-17T20:00:00-04:00"',
      "DTSTART;TZID=America/Cuiaba:20261010T190000",
      "DTSTART;VALUE=DATE:20261115",
      "cn-data: sábado, 24 de outubro de 2026",
      'data-cn-data="2026-10-24"',
      "Museu do Rio, 21 de outubro, às 18h",
      "Feira de Artesanato - 08/11 às 9h",
      "cn-data: sábado, 10/01",
      "<pubDate>Fri, 02 Oct 2026 12:00:00 -0400</pubDate>",
      '"start_date": "2026-10-09 19:00:00"',
      "<h1>Programação 2026</h1>",
    ].join("\n");
    expect(shiftFixtureDates(text, 14).split("\n")).toEqual([
      '"startDate": "2026-10-31T20:00:00-04:00"',
      "DTSTART;TZID=America/Cuiaba:20261024T190000",
      "DTSTART;VALUE=DATE:20261129",
      "cn-data: sábado, 7 de novembro de 2026",
      'data-cn-data="2026-11-07"',
      "Museu do Rio, 4 de novembro, às 18h",
      "Feira de Artesanato - 22/11 às 9h",
      "cn-data: sábado, 24/01",
      "<pubDate>Fri, 16 Oct 2026 12:00:00 -0400</pubDate>",
      '"start_date": "2026-10-23 19:00:00"',
      "<h1>Programação 2026</h1>",
    ]);
  });

  it("vira o ano quando precisa", () => {
    expect(shiftFixtureDates("21 de novembro de 2026 · 2026-11-21", 49)).toBe(
      "9 de janeiro de 2027 · 2027-01-09",
    );
  });
});
