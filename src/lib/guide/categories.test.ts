import { describe, expect, it } from "vitest";
import { CATEGORIES, CUISINES, googleIncludedType, googleTypeMatches } from "./categories";

describe("tipos do Google por categoria", () => {
  it("toda categoria e toda cozinha têm ao menos um tipo do Google", () => {
    for (const c of CATEGORIES) expect(c.googleTypes.length, c.slug).toBeGreaterThan(0);
    for (const c of CUISINES) expect(c.googleTypes.length, c.slug).toBeGreaterThan(0);
  });

  it("hotel não passa como padaria; padaria passa", () => {
    expect(googleTypeMatches("padaria", null, "hotel")).toBe(false);
    expect(googleTypeMatches("padaria", null, "bakery")).toBe(true);
  });

  it("barbearia não passa como cafeteria", () => {
    expect(googleTypeMatches("cafeteria", null, "barber_shop")).toBe(false);
    expect(googleTypeMatches("cafeteria", null, "coffee_shop")).toBe(true);
  });

  it("restaurante aceita qualquer tipo de restaurante; a cozinha exige o tipo dela", () => {
    expect(googleTypeMatches("restaurante", null, "japanese_restaurant")).toBe(true);
    expect(googleTypeMatches("restaurante", null, "restaurant")).toBe(true);
    expect(googleTypeMatches("restaurante", null, "hotel")).toBe(false);
    expect(googleTypeMatches("restaurante", "arabe", "lebanese_restaurant")).toBe(true);
    expect(googleTypeMatches("restaurante", "arabe", "restaurant")).toBe(false);
    expect(googleTypeMatches("restaurante", "arabe", "fast_food_restaurant")).toBe(false);
  });

  it("sem tipo ou categoria desconhecida não passa", () => {
    expect(googleTypeMatches("padaria", null, null)).toBe(false);
    expect(googleTypeMatches("inexistente", null, "bakery")).toBe(false);
  });

  it("o tipo da busca é o da cozinha quando houver, senão o da categoria", () => {
    expect(googleIncludedType("padaria", null)).toBe("bakery");
    expect(googleIncludedType("restaurante", "arabe")).toBe("middle_eastern_restaurant");
    expect(googleIncludedType("restaurante", null)).toBe("restaurant");
  });
});
