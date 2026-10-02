import { describe, expect, it } from "vitest";
import { hasAuthCookie } from "./cookie";

describe("cookie de sessão", () => {
  it("reconhece o cookie do Supabase inteiro ou em pedaços", () => {
    expect(hasAuthCookie("cn_consent=v1|m0|p0; sb-127-auth-token=base64-abc")).toBe(true);
    expect(hasAuthCookie("sb-abc-auth-token.0=base64-abc; x=1")).toBe(true);
  });
  it("sem cookie, ou vazio, não há sessão", () => {
    expect(hasAuthCookie("cn_consent=v1|m0|p0")).toBe(false);
    expect(hasAuthCookie("sb-abc-auth-token=")).toBe(false);
    expect(hasAuthCookie("")).toBe(false);
  });
});
