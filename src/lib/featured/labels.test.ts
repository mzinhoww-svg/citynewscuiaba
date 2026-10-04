import { describe, expect, it } from "vitest";
import { hoursLeft, removalNeedsTyping, untilText } from "./labels";

const NOW = new Date("2026-10-03T18:10:00Z"); // 14h10 em Cuiabá
const inHours = (h: number) => new Date(NOW.getTime() + h * 3_600_000).toISOString();

describe("removalNeedsTyping", () => {
  it("só pede digitação quando falta mais de 24 h ou não há prazo", () => {
    expect(removalNeedsTyping(inHours(2), NOW)).toBe(false);
    expect(removalNeedsTyping(inHours(24), NOW)).toBe(false);
    expect(removalNeedsTyping(inHours(24.1), NOW)).toBe(true);
    expect(removalNeedsTyping(inHours(72), NOW)).toBe(true);
    expect(removalNeedsTyping(null, NOW)).toBe(true);
  });
});

describe("hoursLeft / untilText", () => {
  it("arredonda para cima e devolve nulo sem prazo", () => {
    expect(hoursLeft(inHours(30.2), NOW)).toBe(31);
    expect(hoursLeft(null, NOW)).toBeNull();
    expect(hoursLeft(inHours(-3), NOW)).toBe(0);
  });

  it("hoje mostra só a hora; outro dia mostra a data", () => {
    expect(untilText("2026-10-03T19:00:00Z", NOW)).toBe("15h");
    expect(untilText("2026-10-05T19:30:00Z", NOW)).toBe("05/10/2026, 15h30");
  });
});
