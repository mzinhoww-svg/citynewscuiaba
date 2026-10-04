import { describe, expect, it } from "vitest";
import { hasApprovedCover } from "./cover";

describe("hasApprovedCover (R39)", () => {
  it("foto original, licenciada e ilustração aprovada valem", () => {
    for (const kind of ["original", "licensed", "illustrative", "ai_generated"]) {
      expect(hasApprovedCover({ kind })).toBe(true);
    }
  });

  it("reprodução só com crédito", () => {
    expect(hasApprovedCover({ kind: "reproduction", credit: "Folha do Cerrado" })).toBe(true);
    expect(hasApprovedCover({ kind: "reproduction" })).toBe(false);
    expect(hasApprovedCover({ kind: "reproduction", credit: "  " })).toBe(false);
  });

  it("sem imagem não é capa", () => {
    expect(hasApprovedCover(undefined)).toBe(false);
    expect(hasApprovedCover(null)).toBe(false);
  });
});
