import { describe, expect, it } from "vitest";
import { looksLikeEmail } from "./email-shape";

describe("looksLikeEmail", () => {
  it("aceita e-mail comum, com espaços nas pontas", () => {
    expect(looksLikeEmail("ana@exemplo.com.br")).toBe(true);
    expect(looksLikeEmail("  ana@exemplo.com ")).toBe(true);
  });
  it("recusa sem arroba, sem domínio, com espaço ou longo demais", () => {
    expect(looksLikeEmail("ana.exemplo.com")).toBe(false);
    expect(looksLikeEmail("ana@exemplo")).toBe(false);
    expect(looksLikeEmail("ana silva@exemplo.com")).toBe(false);
    expect(looksLikeEmail(`${"a".repeat(250)}@x.com`)).toBe(false);
  });
});
