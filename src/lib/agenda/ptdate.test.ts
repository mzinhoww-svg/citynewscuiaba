import { describe, expect, it } from "vitest";
import { parsePtDate } from "./ptdate";

const NOW = new Date("2026-10-03T15:00:00Z");

describe("parsePtDate", () => {
  it("lê dia e mês por extenso com horário", () => {
    expect(parsePtDate("Show neste sábado, 17 de outubro, às 19h30", NOW)).toEqual({
      date: "2026-10-17",
      time: "19:30",
    });
  });
  it("lê dd/mm sem ano como próxima ocorrência", () => {
    expect(parsePtDate("Feira 05/01 20h", NOW)).toEqual({ date: "2027-01-05", time: "20:00" });
  });
  it("lê dd/mm/aaaa e horário com dois pontos", () => {
    expect(parsePtDate("12/11/2026 18:00", NOW)).toEqual({ date: "2026-11-12", time: "18:00" });
  });
  it("aceita mês abreviado e sem horário", () => {
    expect(parsePtDate("Dia 8 de nov", NOW)).toEqual({ date: "2026-11-08", time: null });
  });
  it("rejeita data inexistente e texto sem data", () => {
    expect(parsePtDate("31/02/2026", NOW)).toBeNull();
    expect(parsePtDate("Show em breve", NOW)).toBeNull();
  });
});
