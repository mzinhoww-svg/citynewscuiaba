import { describe, expect, it } from "vitest";
import { diffPrompt, normalizePromptBody, promptChanged } from "./prompt-diff";

describe("diffPrompt", () => {
  it("marca palavras acrescentadas e removidas", () => {
    const ops = diffPrompt("Escreva curto e claro.", "Escreva curto, claro e sem adjetivos.");
    expect(ops.some((o) => o.op === "add" && o.text.includes("adjetivos"))).toBe(true);
    expect(ops.some((o) => o.op === "del")).toBe(true);
    expect(ops.some((o) => o.op === "eq" && o.text.includes("Escreva"))).toBe(true);
  });

  it("textos iguais não têm acréscimo nem remoção", () => {
    expect(diffPrompt("igual", "igual").every((o) => o.op === "eq")).toBe(true);
  });

  it("promptChanged ignora fim de linha e espaços nas pontas", () => {
    expect(promptChanged("a\r\nb ", " a\nb")).toBe(false);
    expect(promptChanged("a", "b")).toBe(true);
    expect(normalizePromptBody("  x\r\ny\r")).toBe("x\ny");
  });
});
