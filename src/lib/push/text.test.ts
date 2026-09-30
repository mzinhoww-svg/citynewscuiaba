import { describe, expect, it } from "vitest";
import { sanitizeNotificationText, withOriginLabel } from "./text";

describe("sanitizeNotificationText", () => {
  it("remove HTML e controle, normaliza espaços, corta por grafema", () => {
    expect(sanitizeNotificationText("<b>Chuva</b>\u0007 forte\n em Cuiabá", 60)).toBe(
      "Chuva forte em Cuiabá",
    );
    expect(sanitizeNotificationText("a &amp; b&nbsp;c", 60)).toBe("a & b c");
    const flags = "🇧🇷".repeat(5);
    expect(sanitizeNotificationText(flags, 3)).toBe("🇧🇷🇧🇷…");
    expect(sanitizeNotificationText("x".repeat(70), 60)).toHaveLength(60);
    expect(sanitizeNotificationText("x".repeat(70), 60).endsWith("…")).toBe(true);
    expect(sanitizeNotificationText("", 60)).toBe("");
  });

  it("rótulo de origem vai na frente e fora do máximo", () => {
    expect(withOriginLabel("ORIGINAL CITYNEWS", "Defesa Civil alerta")).toBe(
      "ORIGINAL CITYNEWS · Defesa Civil alerta",
    );
    expect(withOriginLabel("", "x")).toBe("x");
  });
});
