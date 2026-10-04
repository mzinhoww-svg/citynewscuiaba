import { describe, expect, it } from "vitest";
import { isBot, trackKey } from "./track";

describe("contagem de anúncio (ADS-T1)", () => {
  const now = new Date("2026-10-04T15:10:00Z");
  const base = {
    salt: "sal",
    ip: "200.1.2.3",
    ua: "Mozilla/5.0",
    placementId: "p1",
    event: "view" as const,
  };

  it("mesma pessoa, mesma peça e mesmo evento em 30 min: mesma chave (recarga não dobra)", () => {
    const a = trackKey({ ...base, now });
    expect(trackKey({ ...base, now: new Date("2026-10-04T15:25:00Z") })).toBe(a);
    expect(trackKey({ ...base, now: new Date("2026-10-04T15:31:00Z") })).not.toBe(a);
    expect(trackKey({ ...base, now, event: "click" })).not.toBe(a);
    expect(trackKey({ ...base, now, placementId: "p2" })).not.toBe(a);
    expect(trackKey({ ...base, now, ip: "200.1.2.4" })).not.toBe(a);
  });

  it("a chave não contém o IP", () => {
    expect(trackKey({ ...base, now })).not.toContain("200.1.2.3");
  });

  it("robôs e navegadores sem identificação não contam", () => {
    expect(isBot("Mozilla/5.0 (compatible; Googlebot/2.1)")).toBe(true);
    expect(isBot("facebookexternalhit/1.1")).toBe(true);
    expect(isBot("HeadlessChrome/120")).toBe(true);
    expect(isBot("")).toBe(true);
    expect(isBot("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1")).toBe(
      false,
    );
  });
});
