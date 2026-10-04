import { describe, expect, it } from "vitest";
import { ASK } from "./ask";

describe("ASK · texto do limite (UX-W1-T10, item 21)", () => {
  it("com horário, diz quando libera", () => {
    expect(ASK.errorText.rate_limited("15:30")).toBe(
      "O limite libera às 15:30. A busca tradicional continua sem limite.",
    );
  });

  it("sem horário, usa a variante sem hora (nunca 'às .')", () => {
    const text = ASK.errorText.rate_limited("");
    expect(text).not.toMatch(/às\s*\./);
    expect(text).toBe(ASK.errorText.limitNoTime);
  });
});
