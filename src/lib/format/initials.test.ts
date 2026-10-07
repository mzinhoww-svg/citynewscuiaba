import { describe, expect, it } from "vitest";
import { initialsOf } from "./initials";

describe("initialsOf", () => {
  it("usa a primeira letra do primeiro e do último nome", () => {
    expect(initialsOf("Aurimar Nogueira")).toBe("AN");
    expect(initialsOf("Ana Maria da Silva")).toBe("AS");
  });
  it("com um nome só, usa as duas primeiras letras", () => {
    expect(initialsOf("Cuiabana")).toBe("CU");
  });
  it("ignora espaços e preserva acentos em caixa alta", () => {
    expect(initialsOf("  élida   órfão ")).toBe("ÉÓ");
  });
  it("sem nome, devolve vazio", () => {
    expect(initialsOf("   ")).toBe("");
  });
});
