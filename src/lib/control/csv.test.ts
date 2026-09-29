import { csvCell } from "./csv";
import { logFiltersFrom } from "./log-filters";

describe("csvCell", () => {
  it("escapa aspas, quebra de linha e fórmulas de planilha", () => {
    expect(csvCell('diz "oi"')).toBe('"diz ""oi"""');
    expect(csvCell("a\nb")).toBe('"a b"');
    expect(csvCell("=SOMA(A1)")).toBe(`"'=SOMA(A1)"`);
    expect(csvCell("-2+3")).toBe(`"'-2+3"`);
    expect(csvCell(null)).toBe('""');
    expect(csvCell({ a: 1 })).toBe('"{""a"":1}"');
  });
});

describe("logFiltersFrom", () => {
  it("traduz a query, limita o tamanho e ignora vazios", () => {
    const r = logFiltersFrom({
      ciclo: "abc",
      nivel: "error",
      q: "",
      ordem: "asc",
      item: ["x", "y"],
    });
    expect(r).toEqual({ filters: { run: "abc", level: "error", item: "x" }, order: "asc" });
    expect(logFiltersFrom({ q: "z".repeat(500) }).filters.q).toHaveLength(200);
    expect(logFiltersFrom({}).order).toBe("desc");
  });
});
