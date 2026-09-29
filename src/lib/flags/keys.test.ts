import { describe, expect, it } from "vitest";
import { FAIL_CLOSED, FLAG_KEYS, isFlagKey, isSafetySafeguardKey } from "./keys";

describe("chaves de flags", () => {
  it("lista fechada: só as chaves conhecidas", () => {
    expect(isFlagKey("auto_publish")).toBe(true);
    expect(isFlagKey("read_only")).toBe(true);
    expect(isFlagKey("qualquer_coisa")).toBe(false);
    expect(FLAG_KEYS).toHaveLength(7);
  });
  it("falha fechada: nada publica, IA fora, Estúdio sem gravar", () => {
    expect(FAIL_CLOSED.auto_publish).toBe(false);
    expect(FAIL_CLOSED.ai_enabled).toBe(false);
    expect(FAIL_CLOSED.personalization_enabled).toBe(false);
    expect(FAIL_CLOSED.read_only).toBe(true);
    for (const k of FLAG_KEYS) expect(typeof FAIL_CLOSED[k]).toBe("boolean");
  });
  it("salvaguardas de segurança não são flags", () => {
    expect(isSafetySafeguardKey("safety_never_auto")).toBe(true);
    expect(isSafetySafeguardKey("force_review")).toBe(true);
    expect(isSafetySafeguardKey("auto_publish")).toBe(false);
  });
});
