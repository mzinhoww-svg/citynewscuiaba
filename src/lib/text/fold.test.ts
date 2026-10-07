import { describe, expect, it } from "vitest";
import { fold } from "./fold";

describe("fold", () => {
  it("tira acentos e passa para minúsculas", () => {
    expect(fold("Cuiabá")).toBe("cuiaba");
    expect(fold("AÇÃO Pública")).toBe("acao publica");
    expect(fold("Mídia")).toBe("midia");
  });

  it("aceita texto já decomposto (NFD)", () => {
    expect(fold("Cuiabá")).toBe("cuiaba");
  });

  it("não apara nem troca espaços e pontuação", () => {
    expect(fold("  São  Paulo! ")).toBe("  sao  paulo! ");
  });

  it("é idempotente e preserva texto vazio", () => {
    expect(fold("")).toBe("");
    expect(fold(fold("Várzea Grande"))).toBe(fold("Várzea Grande"));
  });
});
