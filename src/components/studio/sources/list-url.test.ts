import { parseSourceFilters } from "@/lib/db/queries/sources-admin";
import { activeFilterCount, clearedHref, listHref, sortHref } from "./list-url";

const parse = (qs: string) => parseSourceFilters(new URLSearchParams(qs));

vi.mock("server-only", () => ({}));

describe("endereço da lista de fontes", () => {
  it("padrões não entram no endereço", () => {
    expect(listHref(parse(""))).toBe("/estudio/control/fontes");
  });

  it("ida e volta: o que parseSourceFilters lê, listHref escreve", () => {
    const qs =
      "q=folha&status=active%2Cpaused&camada=2&via=rapida&saude=critica&ordem=score&dir=desc&pagina=2&arquivadas=only";
    const f = parse(qs);
    const again = parse(listHref(f).split("?")[1] ?? "");
    expect(again).toEqual(f);
  });

  it("ordenar: coluna nova é crescente, a mesma inverte e a página volta a 1", () => {
    const f = parse("status=active&pagina=3");
    expect(sortHref(f, "score")).toBe("/estudio/control/fontes?status=active&ordem=score");
    const g = parse("status=active&ordem=score");
    expect(sortHref(g, "score")).toBe("/estudio/control/fontes?status=active&ordem=score&dir=desc");
    const h = parse("ordem=score&dir=desc");
    expect(sortHref(h, "score")).toBe("/estudio/control/fontes?ordem=score");
  });

  it("conta filtros e limpa mantendo a ordem", () => {
    const f = parse("q=a&status=active&via=normal&ordem=last&dir=desc");
    expect(activeFilterCount(f)).toBe(3);
    expect(clearedHref(f)).toBe("/estudio/control/fontes?ordem=last&dir=desc");
  });
});
