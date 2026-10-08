import { verifyEvidence } from "./evidence";

describe("verifyEvidence", () => {
  it("aceita trecho com outra caixa, acento e espaçamento", () => {
    expect(
      verifyEvidence("Sábado, 10 de outubro de 2026 · 19h", "sabado, 10 de outubro  de 2026"),
    ).toBe(true);
  });

  it("recusa trecho que a página não traz", () => {
    expect(verifyEvidence("Show às 20h", "Show às 21h")).toBe(false);
  });

  it("recusa trecho vazio", () => {
    expect(verifyEvidence("Show às 20h", "   ")).toBe(false);
  });
});
