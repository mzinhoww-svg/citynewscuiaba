// @vitest-environment node
import { describe, expect, it } from "vitest";
import { outsideSourceDomain, registrableDomain, sourceDomain } from "./fetch-image";

const check = (img: string, base: string) =>
  outsideSourceDomain(new URL(img), sourceDomain(base) ?? "");

describe("registrableDomain", () => {
  it.each([
    ["agenciabrasil.ebc.com.br", "ebc.com.br"],
    ["imagens.ebc.com.br", "ebc.com.br"],
    ["cdn.hnt.com.br", "hnt.com.br"],
    ["hnt.com.br", "hnt.com.br"],
    ["folhadocerrado.example", "folhadocerrado.example"],
    ["www.x.gov.br", "x.gov.br"],
    ["a.b.example.com", "example.com"],
    ["localhost", "localhost"],
  ])("%s -> %s", (host, want) => expect(registrableDomain(host)).toBe(want));
});

describe("outsideSourceDomain", () => {
  it("aceita o próprio domínio e subdomínios", () => {
    expect(
      check("https://folhadocerrado.example/a.jpg", "https://folhadocerrado.example"),
    ).toBeNull();
    expect(check("https://cdn.hnt.com.br/a.jpg", "https://www.hnt.com.br")).toBeNull();
  });
  it("aceita CDN do mesmo domínio registrável", () => {
    expect(
      check("https://imagens.ebc.com.br/a.jpg", "https://agenciabrasil.ebc.com.br"),
    ).toBeNull();
  });
  it("recusa domínio parecido ou diferente", () => {
    const base = "https://agenciabrasil.ebc.com.br";
    expect(check("https://evil-ebc.com.br/a.jpg", base)).toMatch(/fora do domínio/);
    expect(check("https://ebc.com.br.evil.com/a.jpg", base)).toMatch(/fora do domínio/);
    expect(check("https://com.br/a.jpg", base)).toMatch(/fora do domínio/);
    expect(check("https://outro.com.br/a.jpg", base)).toMatch(/fora do domínio/);
  });
});
