import { describe, expect, it } from "vitest";
import { sameOriginHost } from "./origin";

describe("sameOriginHost (run-now)", () => {
  it("aceita só a própria origem", () => {
    expect(sameOriginHost("https://citynews.example", "citynews.example")).toBe(true);
    expect(sameOriginHost("http://localhost:3000", "localhost:3000")).toBe(true);
    expect(sameOriginHost("https://outro.example", "citynews.example")).toBe(false);
  });

  it("Origin ausente, `null` ou ilegível é recusado sem lançar", () => {
    expect(sameOriginHost(null, "citynews.example")).toBe(false);
    expect(sameOriginHost("null", "citynews.example")).toBe(false);
    expect(sameOriginHost("não é url", "citynews.example")).toBe(false);
    expect(sameOriginHost("https://citynews.example", null)).toBe(false);
  });
});
