import { describe, expect, it } from "vitest";
import { TAB_NAV } from "@/content/pt-BR/nav";
import { tabForPath } from "./tab-for-path";

/** UX-W4-T3 · item 65 (P-06): toda rota pública acende uma das 5 abas. */
describe("tabForPath", () => {
  it.each([
    ["/", "home"],
    ["/materia/onibus-cpa", "home"],
    ["/sobre", "home"],
    ["/termos", "home"],
    ["/app", "home"],
    ["/explorar", "explore"],
    ["/agenda", "explore"],
    ["/agenda/feira-do-porto", "explore"],
    ["/fontes", "explore"],
    ["/fontes/mt-agora", "explore"],
    ["/panorama", "explore"],
    ["/assuntos", "explore"],
    ["/assunto/seca-e-fumaca", "explore"],
    ["/guia-cuiaba", "explore"],
    ["/guia-cuiaba/padarias", "explore"],
    ["/colecoes/seca-e-fumaca", "explore"],
    ["/cidade", "explore"],
    ["/servicos", "explore"],
    ["/saude", "explore"],
    ["/busca", "search"],
    ["/pergunte", "search"],
    ["/favoritos", "favorites"],
    ["/perfil", "profile"],
    ["/entrar", "profile"],
    ["/criar-conta", "profile"],
    ["/alertas", "profile"],
    ["/newsletter", "profile"],
    ["/recuperar-senha", "profile"],
    ["/redefinir-senha", "profile"],
  ])("%s → %s", (path, tab) => {
    expect(tabForPath(path)).toBe(tab);
  });

  it("ignora barra final, query e âncora", () => {
    expect(tabForPath("/explorar/")).toBe("explore");
    expect(tabForPath("/busca?q=onibus")).toBe("search");
    expect(tabForPath("/agenda#hoje")).toBe("explore");
  });

  it("rota desconhecida ou vazia cai no Início", () => {
    expect(tabForPath("/nao-existe/abc")).toBe("home");
    expect(tabForPath("")).toBe("home");
  });

  it("devolve sempre um destino da barra inferior", () => {
    const ids = TAB_NAV.map((t) => t.id);
    for (const p of ["/", "/agenda", "/busca", "/favoritos", "/perfil", "/x"])
      expect(ids).toContain(tabForPath(p));
  });
});
