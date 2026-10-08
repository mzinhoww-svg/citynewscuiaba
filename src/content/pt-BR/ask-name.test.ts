import { describe, expect, it } from "vitest";
import { ASK, ASK_NAME } from "./ask";
import { EXPLORE } from "./explore";
import { FOOTER_NAV } from "./nav-footer";
import { SEARCH } from "./search";

/** UX-W4-T3 · item 66 (P-08): um nome só para o Pergunte, com entrada no Explorar e no rodapé. */
describe("nome do Pergunte", () => {
  it('é "Perguntar ao CityNews", sem a sigla IA', () => {
    expect(ASK_NAME).toBe("Perguntar ao CityNews");
    expect(ASK_NAME).not.toMatch(/\bIA\b/);
  });

  it("título, busca e Explorar usam o mesmo nome", () => {
    expect(ASK.title).toBe(ASK_NAME);
    expect(ASK.documentTitle("")).toBe(`${ASK_NAME} · CityNews Cuiabá`);
    expect(SEARCH.askAi).toBe(ASK_NAME);
    expect(SEARCH.emptyAsk).toBe(ASK_NAME);
    expect(EXPLORE.ask).toBe(ASK_NAME);
  });

  it("nenhum texto público usa o nome antigo", () => {
    const all = JSON.stringify([ASK, SEARCH, EXPLORE, FOOTER_NAV]);
    expect(all).not.toMatch(/Pergunte ao CityNews/);
  });

  it("o rodapé tem a entrada para /pergunte", () => {
    expect(FOOTER_NAV).toContainEqual(
      expect.objectContaining({ label: ASK_NAME, href: "/pergunte" }),
    );
  });
});
