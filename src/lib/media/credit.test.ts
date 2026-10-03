import { describe, expect, it } from "vitest";
import { creditName, type CreditSource } from "./credit";

const sources: CreditSource[] = [
  { id: "s1", name: "RDNews", baseUrl: "https://www.rdnews.com.br" },
  { id: "s2", name: "MT Agora", baseUrl: "https://mtagora.example/" },
];

describe("creditName", () => {
  it("usa o nome salvo na imagem", () => {
    expect(
      creditName(
        { sourceName: " Folha do Cerrado ", originUrl: "https://cdn.x.net/a.jpg" },
        sources,
      ),
    ).toBe("Folha do Cerrado");
  });
  it("sem nome salvo, usa o veículo pelo id da fonte", () => {
    expect(
      creditName({ sourceId: "s1", originUrl: "https://cdn.rdnews.com.br/a.jpg" }, sources),
    ).toBe("RDNews");
  });
  it("sem id, casa o host da imagem ou da página com o site do veículo, mesmo com subdomínio de CDN", () => {
    expect(creditName({ originUrl: "https://cdn.rdnews.com.br/a.jpg" }, sources)).toBe("RDNews");
    expect(
      creditName(
        { originUrl: "https://static.cdn.net/a.jpg", pageUrl: "https://mtagora.example/x" },
        sources,
      ),
    ).toBe("MT Agora");
  });
  it("sem veículo conhecido, cai no host da página da matéria, nunca no da CDN", () => {
    expect(
      creditName(
        { originUrl: "https://cdn.outro.net/a.jpg", pageUrl: "https://www.outro.example/m" },
        sources,
      ),
    ).toBe("outro.example");
  });
  it("sem nada, devolve undefined", () => {
    expect(creditName({}, sources)).toBeUndefined();
  });
});
