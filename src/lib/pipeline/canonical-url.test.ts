import { canonicalUrl } from "./canonical-url";

describe("canonicalUrl", () => {
  it("canonicaliza", () =>
    expect(canonicalUrl("HTTP://Folhadocerrado.example/a/?utm_source=x&id=2#top")).toBe(
      "https://folhadocerrado.example/a?id=2",
    ));
  it("remove fbclid, gclid e todos os utm_*", () =>
    expect(
      canonicalUrl("https://x.example/n?fbclid=1&gclid=2&utm_medium=feed&utm_campaign=c&page=3"),
    ).toBe("https://x.example/n?page=3"));
  it("ordena os parâmetros restantes", () =>
    expect(canonicalUrl("https://x.example/n?b=2&a=1")).toBe("https://x.example/n?a=1&b=2"));
  it("tira porta padrão, usuário e várias barras finais", () =>
    expect(canonicalUrl("https://user:pw@x.example:443/a/b//")).toBe("https://x.example/a/b"));
  it("raiz fica sem barra", () =>
    expect(canonicalUrl("https://X.example/")).toBe("https://x.example"));
  it("mantém porta não padrão", () =>
    expect(canonicalUrl("http://x.example:8080/a")).toBe("https://x.example:8080/a"));
  it("resolve relativa contra a base", () =>
    expect(canonicalUrl("/cidade/a/", "https://diariodabaixada.example/feed")).toBe(
      "https://diariodabaixada.example/cidade/a",
    ));
  it("recusa esquema que não é http(s) e URL inválida", () => {
    expect(() => canonicalUrl("javascript:alert(1)")).toThrow();
    expect(() => canonicalUrl("ftp://x.example/a")).toThrow();
    expect(() => canonicalUrl("não é url")).toThrow();
  });
});
