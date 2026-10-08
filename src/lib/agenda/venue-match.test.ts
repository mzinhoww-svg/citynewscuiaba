import { describe, expect, it } from "vitest";
import { matchVenue, venueKey, type VenueCandidate } from "./venue-match";

const v = (id: string, name: string, status = "active"): VenueCandidate => ({ id, name, status });

const VENUES: VenueCandidate[] = [
  v("v-zulmira", "Teatro Zulmira Canavarros"),
  v("v-arsenal", "Sesc Arsenal"),
  v("v-cerrado", "Espaço Cultural Cerrado Vivo"),
  v("v-municipal-1", "Teatro Municipal"),
  v("v-municipal-2", "Teatro Municipal"),
  v("v-fechado", "Casa do Forró Fechada", "inactive"),
  v("v-suspenso", "Bar do Rasqueado Fictício", "suspended"),
  v("v-ara", "Ará"),
  v("v-mirante", "Mirante Panorama Fictício"),
];

describe("venueKey", () => {
  it("dobra acentos, tira pontuação, prefixo genérico e cidade no fim", () => {
    expect(venueKey("Teatro Zulmira Canavarros")).toBe("zulmira canavarros");
    expect(venueKey("  Espaço  Cultural: Cerrado-Vivo ")).toBe("cultural cerrado vivo");
    expect(venueKey("Sesc Arsenal - Cuiabá")).toBe("sesc arsenal");
    expect(venueKey("Sesc Arsenal, Cuiabá MT")).toBe("sesc arsenal");
    expect(venueKey("Sesc Arsenal (Cuiabá/MT)")).toBe("sesc arsenal");
  });
});

describe("matchVenue", () => {
  it("nome exato", () => {
    expect(matchVenue("Sesc Arsenal", VENUES)).toBe("v-arsenal");
  });

  it("sem acento e em caixa diferente", () => {
    expect(matchVenue("ESPACO CULTURAL CERRADO VIVO", VENUES)).toBe("v-cerrado");
  });

  it("com ou sem o prefixo genérico", () => {
    expect(matchVenue("Zulmira Canavarros", VENUES)).toBe("v-zulmira");
    expect(matchVenue("Cine Zulmira Canavarros", VENUES)).toBe("v-zulmira");
    expect(matchVenue("Cultural Cerrado Vivo", VENUES)).toBe("v-cerrado");
  });

  it("com a cidade no fim", () => {
    expect(matchVenue("Sesc Arsenal - Cuiabá", VENUES)).toBe("v-arsenal");
    expect(matchVenue("Sesc Arsenal, Cuiabá - MT", VENUES)).toBe("v-arsenal");
  });

  it("quase igual (similaridade ≥ 0,9) com um único candidato", () => {
    expect(matchVenue("Teatro Zulmira Canavaros", VENUES)).toBe("v-zulmira");
  });

  it("dois lugares com o mesmo nome: sem vínculo", () => {
    expect(matchVenue("Teatro Municipal", VENUES)).toBeNull();
    expect(matchVenue("Municipal", VENUES)).toBeNull();
  });

  it("lugar inativo ou suspenso nunca casa", () => {
    expect(matchVenue("Casa do Forró Fechada", VENUES)).toBeNull();
    expect(matchVenue("Bar do Rasqueado Fictício", VENUES)).toBeNull();
  });

  it("nome normalizado curto (menos de 4 letras) nunca casa", () => {
    expect(matchVenue("Ará", VENUES)).toBeNull();
    expect(matchVenue("Teatro", [v("v-teatro", "Teatro")])).toBeNull();
  });

  it("nome parecido abaixo do limite: sem vínculo", () => {
    expect(matchVenue("Mirante Panorâmico", VENUES)).toBeNull();
    expect(matchVenue("Sesc Pantanal", VENUES)).toBeNull();
  });

  it("texto vazio ou só a cidade: sem vínculo", () => {
    expect(matchVenue("", VENUES)).toBeNull();
    expect(matchVenue("Cuiabá - MT", VENUES)).toBeNull();
  });

  it("lista sem lugares: sem vínculo", () => {
    expect(matchVenue("Sesc Arsenal", [])).toBeNull();
  });
});
