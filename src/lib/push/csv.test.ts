import { describe, expect, it } from "vitest";
import { csvCell } from "./csv";

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
