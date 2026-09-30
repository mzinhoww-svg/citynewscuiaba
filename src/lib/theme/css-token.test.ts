import { describe, expect, it } from "vitest";
import { readCssToken } from "./css-token";

describe("readCssToken", () => {
  it("lê --cn-tinta de um CSS dado", () => {
    expect(readCssToken("--cn-tinta", ":root{--cn-tinta: #0f1b2d;}")).toBe("#0f1b2d");
    expect(readCssToken("--cn-tinta", ":root{--cn-tinta-80: #27324a; --cn-tinta:#0f1b2d }")).toBe(
      "#0f1b2d",
    );
    expect(readCssToken("--nao-existe", ":root{--cn-tinta: #0f1b2d;}")).toBeNull();
  });
  it("lê o tokens.css do projeto", () => {
    expect(readCssToken("--cn-tinta")).toMatch(/^#[0-9a-f]{6}$/i);
    expect(readCssToken("--cn-branco")).toMatch(/^#[0-9a-f]{6}$/i);
  });
});
