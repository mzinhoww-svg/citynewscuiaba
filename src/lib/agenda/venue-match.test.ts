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
  it("dobra acentos, tira pontuação, cidade no fim e separa o prefixo genérico", () => {
    expect(venueKey("Teatro Zulmira Canavarros")).toEqual({
      prefix: "teatro",
      core: "zulmira canavarros",
    });
    expect(venueKey("  Espaço  Cultural: Cerrado-Vivo ")).toEqual({
      prefix: "espaco",
      core: "cultural cerrado vivo",
    });
    expect(venueKey("Casa de Cultura")).toEqual({ prefix: "casa", core: "cultura" });
    expect(venueKey("Sesc Arsenal - Cuiabá")).toEqual({ prefix: null, core: "sesc arsenal" });
    expect(venueKey("Sesc Arsenal, Cuiabá MT")).toEqual({ prefix: null, core: "sesc arsenal" });
    expect(venueKey("Sesc Arsenal (Cuiabá/MT)")).toEqual({ prefix: null, core: "sesc arsenal" });
  });

  it("arena, bar e restaurante não são prefixos genéricos", () => {
    expect(venueKey("Arena Pantanal")).toEqual({ prefix: null, core: "arena pantanal" });
    expect(venueKey("Bar Cultura")).toEqual({ prefix: null, core: "bar cultura" });
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

  it("prefixo tirado de um lado só exige núcleo com 2 palavras ou mais", () => {
    const arena = [v("v-arena", "Arena Pantanal")];
    expect(matchVenue("Pantanal", arena)).toBeNull();
    expect(matchVenue("Bar Pantanal", arena)).toBeNull();
    expect(matchVenue("UFMT", [v("v-ufmt", "Teatro da UFMT")])).toBeNull();
    expect(matchVenue("Zulmira Canavarros", VENUES)).toBe("v-zulmira");
  });

  it("prefixos de classes diferentes nunca casam (cine e teatro são da mesma)", () => {
    const casa = [v("v-casa", "Casa de Cultura")];
    expect(matchVenue("Bar Cultura", casa)).toBeNull();
    expect(matchVenue("Espaço Cultura", casa)).toBeNull();
    expect(matchVenue("Espaço Zulmira Canavarros", VENUES)).toBeNull();
    expect(matchVenue("Cine Zulmira Canavarros", VENUES)).toBe("v-zulmira");
  });

  it("limitação conhecida: nome que só sobra genérico depois da cidade não casa", () => {
    // "Cine Teatro Cuiabá" → cidade fora → prefixo "cine" + núcleo "teatro" (genérico): a redação
    // escolhe o lugar no Estúdio.
    expect(matchVenue("Cine Teatro Cuiabá", [v("v-cine", "Cine Teatro Cuiabá")])).toBeNull();
  });

  it("texto vazio ou só a cidade: sem vínculo", () => {
    expect(matchVenue("", VENUES)).toBeNull();
    expect(matchVenue("Cuiabá - MT", VENUES)).toBeNull();
  });

  it("lista sem lugares: sem vínculo", () => {
    expect(matchVenue("Sesc Arsenal", [])).toBeNull();
  });
});
