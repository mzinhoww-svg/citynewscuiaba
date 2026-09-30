import { describe, expect, it } from "vitest";
import { DEFAULT_SESSION_HOURS, sessionExpired } from "./session-age";

const NOW = new Date("2026-09-30T12:00:00Z");

describe("duração da sessão da equipe (A11)", () => {
  it("vence quando o último acesso passou do limite de horas", () => {
    expect(sessionExpired("2026-09-30T00:00:01Z", 12, NOW)).toBe(false);
    expect(sessionExpired("2026-09-29T23:59:59Z", 12, NOW)).toBe(true);
    expect(sessionExpired("2026-09-30T10:59:00Z", 1, NOW)).toBe(true);
  });

  it("sem data de acesso ou com data ilegível não vence; horas inválidas usam o padrão", () => {
    expect(sessionExpired(null, 12, NOW)).toBe(false);
    expect(sessionExpired(undefined, 12, NOW)).toBe(false);
    expect(sessionExpired("ontem", 12, NOW)).toBe(false);
    expect(DEFAULT_SESSION_HOURS).toBe(12);
    expect(sessionExpired("2026-09-29T23:00:00Z", Number.NaN, NOW)).toBe(true);
    expect(sessionExpired("2026-09-30T02:00:00Z", 0, NOW)).toBe(false);
  });
});
