import { describe, expect, it } from "vitest";
import { collectRange, csvCell } from "./csv";

describe("csvCell", () => {
  it("cita separadores e dobra aspas", () => {
    expect(csvCell('Chuva, "forte"')).toBe('"Chuva, ""forte"""');
    expect(csvCell(null)).toBe("");
    expect(csvCell(12)).toBe("12");
  });

  it.each(["=SOMA(A1:A2)", "+55 65", "-2+3", "@usuario", "\tcmd", "\rcmd"])(
    "texto que começa fórmula (%j) ganha apóstrofo (PWA-13)",
    (t) => {
      expect(csvCell(t).replace(/^"/, "")).toMatch(/^'/);
    },
  );

  it("número negativo e texto comum ficam como estão", () => {
    expect(csvCell(-1)).toBe("-1");
    expect(csvCell("Chuva em Cuiabá")).toBe("Chuva em Cuiabá");
  });
});

describe("collectRange (histórico além do max_rows)", () => {
  /** Servidor que corta cada resposta em `maxRows`, como o PostgREST. */
  function server(total: number, maxRows = 1000) {
    const calls: [number, number][] = [];
    const fetchRange = async (from: number, to: number) => {
      calls.push([from, to]);
      const n = Math.max(0, Math.min(to - from + 1, maxRows, total - from));
      return Array.from({ length: n }, (_, i) => from + i);
    };
    return { fetchRange, calls };
  }

  it("junta páginas sem repetir nem perder linha", async () => {
    const r = await collectRange(server(2300).fetchRange, 5000);
    expect(r.rows).toHaveLength(2300);
    expect(new Set(r.rows).size).toBe(2300);
    expect(r.truncated).toBe(false);
  });

  it("passa de 1000 e para no limite avisando o truncamento", async () => {
    const r = await collectRange(server(7000).fetchRange, 5000);
    expect(r.rows).toHaveLength(5000);
    expect(r.truncated).toBe(true);
  });

  it("exatamente no limite não é truncamento", async () => {
    const r = await collectRange(server(5000).fetchRange, 5000);
    expect(r.rows).toHaveLength(5000);
    expect(r.truncated).toBe(false);
  });

  it("segue mesmo quando o servidor devolve menos que a página pedida", async () => {
    const r = await collectRange(server(1200, 400).fetchRange, 5000);
    expect(r.rows).toHaveLength(1200);
  });
});
